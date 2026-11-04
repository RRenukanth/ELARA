import { useState, useEffect, useRef } from "react";
import { useEcgDevice } from "../hooks/useEcgDevice.js";

/**
 * AD8232 Electrocardiogram (ECG) Live Monitor Card
 *
 * Displays:
 * - Real-time 500 Hz ECG oscilloscope waveform (P-Q-R-S-T)
 * - Three Cleveland-mapped auto-syncing fields:
 *     1. Rest ECG (Normal / ST-T abnormality / LVH)
 *     2. ST Depression (Oldpeak in mm)
 *     3. ECG ST-segment Slope (Downsloping / Flat / Upsloping)
 * - Lead-Off detection (LO+ / LO-)
 * - P-Q-R-S-T-J landmark amplitudes & RL State telemetry
 */
export default function EcgDeviceCard({ onEcgUpdate }) {
  const [showConsole, setShowConsole] = useState(false);
  const [showWifiInput, setShowWifiInput] = useState(false);
  const [wifiHost, setWifiHost] = useState(() => localStorage.getItem("elara_ecg_wifi_host") || "192.168.8.108");
  const canvasRef = useRef(null);

  const {
    isConnected,
    isConnecting,
    isSimulating,
    connectionMode,
    leadsOff,
    samples,
    heartRate,
    landmarks,
    stDeviation,
    oldpeak,
    stSlope,
    restECG,
    slopeCategory,
    signalQuality,
    mappingConfidence,
    outOfDistribution,
    rlState,
    logs,
    error,
    connectWifi,
    startSimulation,
    disconnect,
  } = useEcgDevice({ onEcgUpdate });

  const handleWifiConnectSubmit = (e) => {
    e.preventDefault();
    const cleanHost = wifiHost.trim() || "elara-ecg.local";
    localStorage.setItem("elara_ecg_wifi_host", cleanHost);
    connectWifi(cleanHost);
  };

  // Convert slope category for human-readable display
  const getSlopeLabel = (cat) => {
    const s = Number(cat);
    if (s === 1) return { text: "Upsloping", icon: "↗", color: "text-emerald-400", formVal: 2 };
    if (s === 2) return { text: "Flat", icon: "→", color: "text-amber-400", formVal: 1 };
    if (s === 3 || s === 0) return { text: "Downsloping", icon: "↘", color: "text-crimson-400", formVal: 0 };
    return { text: "Flat", icon: "→", color: "text-amber-400", formVal: 1 };
  };

  const getRestEcgLabel = (val) => {
    const v = Number(val);
    if (v === 0) return { text: "Normal", badge: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" };
    if (v === 1) return { text: "ST-T Wave Abnormality", badge: "bg-amber-950/60 text-amber-300 border-amber-500/40" };
    if (v === 2) return { text: "Left Ventricular Hypertrophy", badge: "bg-crimson-950/60 text-crimson-300 border-crimson-500/40" };
    return { text: "Normal", badge: "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" };
  };

  const currentSlope = getSlopeLabel(slopeCategory);
  const currentRestEcg = getRestEcgLabel(restECG);

  // Render ECG Oscilloscope Waveform on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let animationId;
    let fallbackPhase = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      const midY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Oscilloscope Medical Grid Lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(16, 185, 129, 0.08)";
      const gridStep = 25;
      for (let x = 0; x < width; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center baseline
      ctx.strokeStyle = "rgba(16, 185, 129, 0.18)";
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // 2. Waveform Trace
      if (isConnected && !leadsOff && samples && samples.length > 1) {
        let minVal = Math.min(...samples);
        let maxVal = Math.max(...samples);
        if (maxVal - minVal < 1) {
          minVal -= 50;
          maxVal += 50;
        }

        ctx.beginPath();
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = "#00ff88"; // Vivid clinical green
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 8;

        for (let i = 0; i < samples.length; i++) {
          const x = (i / (samples.length - 1)) * width;
          const normalized = (samples[i] - minVal) / (maxVal - minVal);
          const y = height - (normalized * (height * 0.78) + height * 0.11);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Draw leading oscilloscope sweep dot
        const lastX = width;
        const lastNorm = (samples[samples.length - 1] - minVal) / (maxVal - minVal);
        const lastY = height - (lastNorm * (height * 0.78) + height * 0.11);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (leadsOff) {
        // Flatline warning when leads are disconnected
        ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#f87171";
        ctx.textAlign = "center";
        ctx.fillText("⚠️ ELECTRODES DISCONNECTED (LEADS OFF)", width / 2, midY - 14);
      } else {
        // Idle ambient scanline
        fallbackPhase += 0.03;
        ctx.strokeStyle = "rgba(16, 185, 129, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < width; x += 4) {
          const y = midY + Math.sin(x * 0.02 + fallbackPhase) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.font = "12px sans-serif";
        ctx.fillStyle = "rgba(16, 185, 129, 0.5)";
        ctx.textAlign = "center";
        ctx.fillText("Awaiting ECG Signal Connection...", width / 2, midY - 12);
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isConnected, leadsOff, samples]);

  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-neon-950 via-[#031b14] to-neon-900 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-6">
      {/* Decorative ambient top glow */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

      {/* Card Header & Controls */}
      <div className="relative z-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-950/60 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            {/* ECG Pulse Activity Icon */}
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12h4l2-6 4 13 3-9 2 4h3"
              />
            </svg>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">
                Electrocardiogram (AD8232 ECG)
              </h2>

              {/* Status Badge */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                  isConnected
                    ? "bg-emerald-950/80 text-emerald-300 border-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    : isConnecting
                    ? "bg-amber-950/80 text-amber-300 border-amber-400/40 animate-pulse"
                    : "bg-neon-900/60 text-neon-400 border-white/10"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? "bg-emerald-400 animate-pulse" : isConnecting ? "bg-amber-400" : "bg-neon-600"
                  }`}
                />
                {isConnected
                  ? connectionMode === "wifi"
                    ? "WiFi Connected (Mobitel_4G_B69AC)"
                    : "ECG Simulated Stream"
                  : isConnecting
                  ? "Connecting..."
                  : "Disconnected"}
              </span>

              {/* Leads Off Indicator */}
              {isConnected && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                    leadsOff
                      ? "bg-crimson-950/80 text-crimson-300 border-crimson-500/50 animate-bounce"
                      : "bg-emerald-950/50 text-emerald-300 border-emerald-500/30"
                  }`}
                >
                  {leadsOff ? "⚠️ Leads Disconnected" : "✓ Leads Attached"}
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs text-emerald-200/70">
              500 Hz Acquisition • Digital 0.05-100Hz Bandpass + 50Hz Notch • Auto-syncs RestECG, Oldpeak & Slope
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {!isConnected ? (
            <>
              {/* Connect via WiFi Button (1-Click) */}
              <div className="inline-flex rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.35)]">
                <button
                  type="button"
                  onClick={() => connectWifi(wifiHost || "elara-ecg.local")}
                  disabled={isConnecting}
                  className="btn-primary flex items-center gap-2 rounded-r-none text-sm bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400/40 hover:from-emerald-500 hover:to-teal-500"
                  title={`Connect directly via WiFi to ${wifiHost}`}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                    />
                  </svg>
                  {isConnecting ? "Connecting ECG..." : "Connect ECG (WiFi)"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWifiInput((prev) => !prev)}
                  className="rounded-r-xl border border-l-0 border-emerald-400/40 bg-emerald-900/60 px-2.5 text-xs text-emerald-200 hover:bg-emerald-800/80 transition flex items-center justify-center"
                  title="Configure ESP32 ECG IP or Hostname"
                >
                  <svg className="h-4 w-4 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

              {/* Simulate ECG Button */}
              <button
                type="button"
                onClick={startSimulation}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-emerald-300 hover:bg-white/10 hover:text-white transition"
              >
                Simulate ECG
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={disconnect}
              className="inline-flex items-center gap-2 rounded-xl border border-crimson-500/40 bg-crimson-950/40 px-4 py-2.5 text-sm font-semibold text-crimson-200 transition hover:bg-crimson-900/60 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Disconnect ECG
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowConsole((prev) => !prev)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-emerald-300 hover:bg-white/10 hover:text-white transition"
          >
            {showConsole ? "Hide Telemetry" : "Show Telemetry"}
          </button>
        </div>
      </div>

      {/* WiFi Configuration Drawer */}
      {showWifiInput && !isConnected && (
        <form
          onSubmit={handleWifiConnectSubmit}
          className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="block text-emerald-300 font-semibold mb-1">
              ESP32 ECG Device IP / Hostname:
            </label>
            <input
              type="text"
              value={wifiHost}
              onChange={(e) => setWifiHost(e.target.value)}
              placeholder="e.g. 192.168.8.109 or elara-ecg.local"
              className="input-field py-2 text-xs"
            />
          </div>
          <div className="flex items-end gap-2 pt-4">
            <button
              type="submit"
              disabled={isConnecting}
              className="btn-primary py-2 px-4 text-xs shadow-md bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400"
            >
              {isConnecting ? "Connecting..." : "Connect WiFi Stream"}
            </button>
            <button
              type="button"
              onClick={() => setShowWifiInput(false)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-emerald-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="w-full text-[11px] text-emerald-400/80">
            Tip: Your AD8232 ESP32 connects to <strong>Mobitel_4G_B69AC</strong> and serves live data at{" "}
            <code>http://elara-ecg.local/api/ecg</code> (or direct IP).
          </p>
        </form>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-4 rounded-xl border border-crimson-500/40 bg-crimson-950/60 p-3 text-sm text-crimson-200">
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {/* Live ECG Metrics Grid: RestECG, Oldpeak, Slope & HeartRate */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Metric 1: RESTING ECG (restecg) */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-neon-900/80 to-neon-950/90 p-4 shadow-[0_4px_20px_rgba(16,185,129,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Resting ECG Result
            </span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              Auto-Syncs
            </span>
          </div>

          <div className="mt-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold tracking-tight text-white">
                {isConnected && !leadsOff ? `Type ${restECG}` : "--"}
              </span>
              <span className="text-xs font-semibold text-emerald-400">
                (Cleveland Category)
              </span>
            </div>
            <div className="mt-2">
              <span className={`inline-block rounded-lg border px-2.5 py-1 text-xs font-semibold ${currentRestEcg.badge}`}>
                {isConnected && !leadsOff ? currentRestEcg.text : "Awaiting sensor..."}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-neon-400">
            0: Normal • 1: ST-T wave abnormality • 2: LVH
          </p>
        </div>

        {/* Metric 2: ST DEPRESSION / OLDPEAK */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-neon-900/80 to-neon-950/90 p-4 shadow-[0_4px_20px_rgba(63,224,255,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              ST Depression (Oldpeak)
            </span>
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
              Auto-Syncs
            </span>
          </div>

          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">
              {isConnected && !leadsOff ? oldpeak.toFixed(1) : "--"}
            </span>
            <span className="text-sm font-semibold text-cyan-300">mm (mV)</span>
          </div>
          <p className="mt-2 text-[11px] text-neon-400">
            {isConnected && !leadsOff
              ? oldpeak > 1.0
                ? "⚠️ Significant ST depression detected"
                : "✓ Baseline ST deviation normal"
              : "Calculated from J-point vs baseline"}
          </p>
        </div>

        {/* Metric 3: ECG ST-SEGMENT SLOPE */}
        <div className="relative overflow-hidden rounded-2xl border border-teal-400/30 bg-gradient-to-br from-neon-900/80 to-neon-950/90 p-4 shadow-[0_4px_20px_rgba(20,184,166,0.12)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
              ST-Segment Slope
            </span>
            <span className="rounded-full bg-teal-500/20 px-2 py-0.5 text-[10px] font-semibold text-teal-300">
              Auto-Syncs
            </span>
          </div>

          <div className="mt-2.5 flex items-baseline gap-2">
            <span className={`text-2xl font-extrabold tracking-tight ${currentSlope.color}`}>
              {isConnected && !leadsOff ? `${currentSlope.icon} ${currentSlope.text}` : "--"}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neon-400">
            Maps to Form: 0: Downsloping • 1: Flat • 2: Upsloping
          </p>
        </div>
      </div>

      {/* Real-time Oscilloscope ECG Waveform Display */}
      <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-[#061214] p-3 shadow-inner">
        <div className="mb-2 flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold text-emerald-300 tracking-wide">
              REAL-TIME ECG WAVEFORM (0.05 - 100 Hz Bandpass • 50 Hz Notch)
            </span>
          </div>
          <span className="text-[11px] text-emerald-400/80">
            Sampling: 500 Hz • Lead I (AD8232)
          </span>
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={200}
          className="h-44 w-full rounded-xl bg-[#040e0f]"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between px-1 text-[11px] text-emerald-300/70">
          <span>Real filtered AD8232 bio-potential signal</span>
          <span>Landmarks Detected: P • Q • R • S • T • J</span>
        </div>
      </div>

      {/* Expandable ECG Landmarks & Cleveland RL Pipeline Telemetry */}
      {showConsole && (
        <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-neon-950/90 p-4 text-xs font-mono">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
            <span className="font-bold text-emerald-300">
              📊 AD8232 Landmark Analysis & Cleveland RL State Pipeline
            </span>
            <span className="text-[11px] text-neon-400">
              Confidence: {Math.round(mappingConfidence * 100)}% • OOD: {outOfDistribution ? "YES" : "NO"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-neon-200">
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">P Amplitude:</span>
              <span className="font-bold">{landmarks.P.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">Q Amplitude:</span>
              <span className="font-bold">{landmarks.Q.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">R Amplitude:</span>
              <span className="font-bold text-emerald-400">{landmarks.R.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">S Amplitude:</span>
              <span className="font-bold">{landmarks.S.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">T Amplitude:</span>
              <span className="font-bold">{landmarks.T.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white/5 p-2 border border-white/5">
              <span className="text-[10px] text-neon-400 block">J-Point Amplitude:</span>
              <span className="font-bold">{landmarks.J.toFixed(2)}</span>
            </div>
          </div>

          {rlState && (
            <div className="mt-3 rounded-xl bg-black/40 p-3 border border-white/5 text-[11px]">
              <span className="font-bold text-cyan-300 block mb-1">
                Generated Cleveland RL State Vector (10 Canonical Features):
              </span>
              <code className="text-neon-300">
                {JSON.stringify(rlState, null, 2)}
              </code>
            </div>
          )}

          {/* Connection Logs */}
          <div className="mt-3 max-h-32 overflow-y-auto rounded-xl bg-black/50 p-2.5 text-[11px] space-y-1">
            <span className="text-[10px] text-neon-500 uppercase tracking-wider block">Connection Event Logs:</span>
            {logs.map((log) => (
              <div key={log.id} className="flex gap-2">
                <span className="text-neon-500">{log.time}</span>
                <span className={log.type === "error" ? "text-crimson-400" : log.type === "success" ? "text-emerald-400" : "text-neon-300"}>
                  {log.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
