import { useState, useEffect, useRef } from "react";
import { useWearableDevice } from "../hooks/useWearableDevice.js";

/**
 * Wearable Device Connection & Live Heart Rate Monitor Panel
 *
 * Supports:
 * - Wireless WiFi connection (Mobitel_4G_B69AC router)
 * - USB Web Serial connection (115200 baud)
 * - Built-in Simulator
 */
export default function WearableDeviceCard({ onThalachUpdate, thalachReady, onThalachReadyChange, onConnectionChange }) {
  const [showConsole, setShowConsole] = useState(false);
  const [showWifiInput, setShowWifiInput] = useState(false);
  const [wifiHost, setWifiHost] = useState(() => localStorage.getItem("elara_wifi_host") || "192.168.8.108");
  const canvasRef = useRef(null);

  const {
    isConnected,
    isConnecting,
    isSimulating,
    connectionMode,
    avgBpm,
    instantBpm,
    thalach,
    irValue,
    fingerDetected,
    pulseDetected,
    deviceWifiInfo,
    logs,
    error,
    isWebSerialSupported,
    connectSerial,
    connectWifi,
    disconnect,
    startSimulation,
  } = useWearableDevice({ onThalachUpdate });

  // Notify parent whenever the device connects or disconnects
  useEffect(() => {
    if (onConnectionChange) onConnectionChange(isConnected);
  }, [isConnected, onConnectionChange]);

  const handleWifiConnectSubmit = (e) => {
    e.preventDefault();
    const cleanHost = wifiHost.trim() || "elara-wearable.local";
    localStorage.setItem("elara_wifi_host", cleanHost);
    connectWifi(cleanHost);
  };

  // Continuous PPG pulse wave rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    let phase = 0;
    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;

      // Draw subtle grid
      ctx.strokeStyle = "rgba(63, 224, 255, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw wave
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isConnected && fingerDetected ? "#3fe0ff" : "rgba(90, 160, 255, 0.35)";

      const amplitude = isConnected && fingerDetected ? (pulseDetected ? 24 : 14) : 2;

      for (let x = 0; x < width; x++) {
        const waveX = (x + phase) * 0.04;
        const mainPulse = Math.sin(waveX);
        const harmonic = Math.sin(waveX * 2 + 1) * 0.35;
        const y = midY - (mainPulse + harmonic) * amplitude;

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (isConnected && fingerDetected) {
        const leadX = width - (phase % width);
        const leadWaveX = (leadX + phase) * 0.04;
        const leadY = midY - (Math.sin(leadWaveX) + Math.sin(leadWaveX * 2 + 1) * 0.35) * amplitude;

        ctx.shadowBlur = 10;
        ctx.shadowColor = "#3fe0ff";
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(leadX, leadY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      phase += isConnected && fingerDetected ? 2.5 : 0.8;
      animationFrameId = requestAnimationFrame(renderWave);
    };

    renderWave();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isConnected, fingerDetected, pulseDetected]);

  return (
    <div className="card card-tint-cyan relative mb-6 overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-neon-900/90 via-neon-950/95 to-neon-900/80 shadow-2xl">
      {/* Background ambient medical glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-crimson-500/10 blur-3xl" />

      {/* Top Header & Connection Controls */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-300 ${
              isConnected
                ? "border-cyan-400 bg-cyan-950/70 text-cyan-300 shadow-[0_0_15px_rgba(63,224,255,0.35)]"
                : "border-white/10 bg-white/5 text-neon-400"
            }`}
          >
            {/* Cardiac Pulse Icon */}
            <svg
              className={`h-6 w-6 ${pulseDetected ? "scale-125 text-crimson-400" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-neon-50">Wearable Health Sensor (MAX30102)</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isConnected
                    ? connectionMode === "wifi"
                      ? "border border-cyan-400/40 bg-cyan-950/80 text-cyan-300 shadow-[0_0_10px_rgba(63,224,255,0.3)]"
                      : isSimulating
                      ? "border border-amber-500/30 bg-amber-950/60 text-amber-300"
                      : "border border-blue-400/30 bg-blue-950/70 text-blue-300"
                    : "border border-white/10 bg-white/5 text-neon-400"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected
                      ? connectionMode === "wifi"
                        ? "bg-cyan-400 animate-ping"
                        : isSimulating
                        ? "bg-amber-400 animate-pulse"
                        : "bg-blue-400 animate-pulse"
                      : "bg-neon-600"
                  }`}
                />
                {isConnected
                  ? connectionMode === "wifi"
                    ? `WiFi Connected (${deviceWifiInfo?.ssid || "Mobitel_4G_B69AC"})`
                    : isSimulating
                    ? "Simulated Hardware Mode"
                    : "Live USB Serial Connected"
                  : "Disconnected"}
              </span>
            </div>
            <p className="text-xs text-neon-300">
              WiFi: Mobitel_4G_B69AC &bull; Rolling 8-BPM Average &bull; Confirmed Thalach Detection
            </p>
          </div>
        </div>

        {/* Action Buttons: Connect Wearable Device (WiFi / USB) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isConnected ? (
            <>
              {/* Connect via WiFi Button (1-Click Direct Connect) */}
              <div className="inline-flex rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.35)]">
                <button
                  type="button"
                  onClick={() => connectWifi(wifiHost || "192.168.8.108")}
                  disabled={isConnecting}
                  className="btn-primary flex items-center gap-2 rounded-r-none text-sm hover:shadow-[0_0_25px_rgba(63,224,255,0.6)]"
                  title={`Connect directly via WiFi to ${wifiHost || "192.168.8.108"}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                    />
                  </svg>
                  {isConnecting && connectionMode === "wifi" ? "Connecting WiFi..." : "Connect via WiFi"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWifiInput((prev) => !prev)}
                  className="rounded-r-xl border border-l-0 border-neon-400/40 bg-neon-700/60 px-2.5 text-xs text-neon-200 hover:bg-neon-600/80 transition flex items-center justify-center"
                  title="Configure ESP32 IP or Hostname"
                >
                  <svg className="h-4 w-4 text-neon-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
              </div>

              {/* Connect via USB Serial Button */}
              <button
                type="button"
                onClick={connectSerial}
                disabled={isConnecting}
                className="btn-secondary flex items-center gap-1.5 text-xs hover:border-cyan-400"
              >
                <svg className="h-3.5 w-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                USB Serial
              </button>

              {/* Simulate Button */}
              <button
                type="button"
                onClick={startSimulation}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neon-300 hover:text-white"
              >
                Simulate
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={disconnect}
                className="inline-flex items-center gap-2 rounded-xl border border-crimson-500/40 bg-crimson-950/40 px-4 py-2.5 text-sm font-semibold text-crimson-200 transition hover:bg-crimson-900/60 hover:text-white"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Disconnect Device
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowConsole((prev) => !prev)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neon-300 hover:bg-white/10 hover:text-white transition"
          >
            {showConsole ? "Hide Telemetry" : "Show Telemetry"}
          </button>
        </div>
      </div>

      {/* WiFi Host / IP Configuration Drawer */}
      {showWifiInput && !isConnected && (
        <form
          onSubmit={handleWifiConnectSubmit}
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/40 p-3.5 text-xs"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-neon-300 font-semibold mb-1">
              ESP32 Device IP / Hostname (Connected to Mobitel_4G_B69AC):
            </label>
            <input
              type="text"
              value={wifiHost}
              onChange={(e) => setWifiHost(e.target.value)}
              placeholder="e.g. 192.168.8.150 or elara-wearable.local"
              className="input-field py-2 text-xs"
            />
          </div>
          <div className="flex items-end gap-2 pt-4">
            <button
              type="submit"
              disabled={isConnecting}
              className="btn-primary py-2 px-4 text-xs shadow-md"
            >
              {isConnecting ? "Connecting..." : "Connect WiFi Stream"}
            </button>
            <button
              type="button"
              onClick={() => setShowWifiInput(false)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-neon-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="w-full text-[11px] text-neon-400">
            Tip: Your ESP32 connects to <strong>Mobitel_4G_B69AC</strong> and serves live data at{" "}
            <code>http://elara-wearable.local/data</code> (or its assigned <code>192.168.8.x</code> IP).
          </p>
        </form>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-4 rounded-xl border border-crimson-500/40 bg-crimson-950/60 p-3 text-sm text-crimson-200">
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Live Data Display Section */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: AVERAGE HEART RATE */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-400/40 bg-gradient-to-br from-neon-900/80 to-neon-950/90 p-4 shadow-[0_4px_20px_rgba(63,224,255,0.15)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              Average Heart Rate
            </span>
            <span
              className={`inline-flex items-center justify-center transition-all duration-200 ${
                isConnected && avgBpm > 0 ? "animate-heartbeat text-crimson-400 drop-shadow-[0_0_8px_rgba(255,59,92,0.6)]" : "text-neon-600"
              }`}
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">
              {isConnected && avgBpm > 0 ? avgBpm : "--"}
            </span>
            <span className="text-sm font-semibold text-cyan-300">BPM</span>
          </div>

          <p className="mt-1 text-xs text-neon-300">
            {isConnected
              ? avgBpm > 0
                ? "Calculated from 8-beat rolling window"
                : "Collecting beat samples..."
              : "Connect device to monitor"}
          </p>

          <div
            className={`mt-3 h-1 w-full rounded-full transition-colors ${
              isConnected && avgBpm > 0
                ? "bg-gradient-to-r from-cyan-400 to-crimson-500 shadow-[0_0_8px_rgba(63,224,255,0.5)]"
                : "bg-white/10"
            }`}
          />
        </div>

        {/* Metric 2: THALACH (Maximum Heart Rate Achieved) */}
        <div className="relative overflow-hidden rounded-2xl border border-neon-500/40 bg-gradient-to-br from-neon-900/80 to-neon-950/90 p-4 shadow-[0_4px_20px_rgba(47,123,255,0.15)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neon-200">
              Max Heart Rate (Thalach)
            </span>
            <span className="rounded-md bg-neon-500/20 px-2 py-0.5 text-[10px] font-bold text-neon-300">
              AI Feature
            </span>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-neon-100">
              {isConnected && thalach > 0 ? thalach.toFixed(1) : "--"}
            </span>
            <span className="text-sm font-semibold text-neon-300">BPM</span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {isConnected && thalach > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-cyan-300">
                <svg className="h-3 w-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Auto-synced to Patient Form
              </span>
            ) : (
              <span className="text-neon-400">Confirmed over 3 similar points</span>
            )}
          </div>

          <div
            className={`mt-3 h-1 w-full rounded-full transition-colors ${
              isConnected && thalach > 0
                ? "bg-gradient-to-r from-neon-400 to-cyan-300 shadow-[0_0_8px_rgba(47,123,255,0.5)]"
                : "bg-white/10"
            }`}
          />
        </div>

        {/* Metric 3: Live Instant BPM */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neon-300">
              Instantaneous Pulse
            </span>
            <span
              className={`h-2.5 w-2.5 rounded-full transition-transform ${
                pulseDetected ? "scale-150 bg-crimson-400" : "bg-neon-600"
              }`}
            />
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-neon-50">
              {isConnected && instantBpm > 0 ? instantBpm.toFixed(1) : "--"}
            </span>
            <span className="text-sm font-semibold text-neon-400">BPM</span>
          </div>

          <p className="mt-1 text-xs text-neon-400">
            {isConnected && instantBpm > 0
              ? `IR Reflectance: ${irValue.toLocaleString()}`
              : "Awaiting next heartbeat..."}
          </p>

          <div className="mt-3 h-1 w-full rounded-full bg-white/10" />
        </div>

        {/* Metric 4: Sensor & Finger Placement Status */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neon-300">
              Sensor State
            </span>
            <span
              className={`text-xs font-semibold ${
                isConnected
                  ? fingerDetected
                    ? "text-cyan-300"
                    : "text-amber-300"
                  : "text-neon-500"
              }`}
            >
              {isConnected ? (fingerDetected ? "Active" : "Idle") : "Offline"}
            </span>
          </div>

          <div className="mt-2">
            <p className="text-base font-bold text-neon-100">
              {!isConnected
                ? "Device Standby"
                : fingerDetected
                ? "Finger Detected"
                : "Place Finger on Sensor"}
            </p>
            <p className="text-xs text-neon-400 mt-1">
              {!isConnected
                ? "Connect via WiFi or USB"
                : fingerDetected
                ? "Continuous PPG reading in progress"
                : "Threshold: IR > 50,000 required"}
            </p>
          </div>

          <div
            className={`mt-3 h-1 w-full rounded-full ${
              isConnected && fingerDetected ? "bg-cyan-400" : "bg-white/10"
            }`}
          />
        </div>
      </div>

      {/* Real-time Photoplethysmogram (PPG) Pulse Wave Visualizer */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-neon-950/90 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-neon-300">
              Live Photoplethysmogram (PPG) Waveform
            </span>
          </div>
          <span className="text-xs text-neon-400">
            {isConnected ? (fingerDetected ? "Signal Quality: Optimal" : "No Finger Contact") : "Hardware Off"}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={760}
          height={64}
          className="h-16 w-full rounded-xl bg-neon-950/95"
        />
      </div>

      {/* Collapsible Telemetry Console */}
      {showConsole && (
        <div className="mt-4 rounded-xl border border-white/15 bg-black/75 p-3.5 font-mono text-xs shadow-inner">
          <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-neon-400">
            <span className="font-semibold text-cyan-300">
              {connectionMode === "wifi" ? `WiFi Stream (http://${wifiHost}/data)` : "Raw Serial / Telemetry Stream"}
            </span>
            <span>{logs.length} entries</span>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1 text-neon-200">
            {logs.length === 0 ? (
              <p className="text-neon-500 italic">No telemetry data received yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-neon-500 select-none">[{log.time}]</span>
                  <span
                    className={
                      log.type === "error"
                        ? "text-crimson-400 font-bold"
                        : log.text.includes("THALACH CONFIRMED")
                        ? "text-cyan-300 font-bold"
                        : log.type === "wifi"
                        ? "text-cyan-200"
                        : "text-neon-300"
                    }
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
