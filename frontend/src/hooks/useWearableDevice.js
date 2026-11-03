import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom React hook for connecting to the MAX30102 Wearable Device.
 *
 * Supports Dual Connection Modes:
 * 1. Wireless WiFi Streaming (HTTP REST /data from ESP32)
 * 2. Native Web Serial API at 115200 baud (USB COM port)
 * 3. High-fidelity built-in hardware simulator
 */
export function useWearableDevice({ onThalachUpdate } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [connectionMode, setConnectionMode] = useState("none"); // "none", "serial", "wifi", "simulated"
  const [deviceStatus, setDeviceStatus] = useState("disconnected");
  const [avgBpm, setAvgBpm] = useState(0);
  const [instantBpm, setInstantBpm] = useState(0);
  const [thalach, setThalach] = useState(0);
  const [irValue, setIrValue] = useState(0);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [pulseDetected, setPulseDetected] = useState(false);
  const [deviceWifiInfo, setDeviceWifiInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // References for Web Serial stream and WiFi polling
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const readableStreamClosedRef = useRef(null);
  const keepReadingRef = useRef(false);
  const wifiIntervalRef = useRef(null);
  const simulationIntervalRef = useRef(null);
  const pulseTimeoutRef = useRef(null);

  // Stable refs to prevent unnecessary effect cleanups
  const onThalachUpdateRef = useRef(onThalachUpdate);
  useEffect(() => {
    onThalachUpdateRef.current = onThalachUpdate;
  }, [onThalachUpdate]);


  const isWebSerialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  const addLog = useCallback((text, type = "info") => {
    setLogs((prev) => [
      ...prev.slice(-25),
      {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString(),
        text,
        type,
      },
    ]);
  }, []);

  const triggerPulse = useCallback(() => {
    setPulseDetected(true);
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    pulseTimeoutRef.current = setTimeout(() => {
      setPulseDetected(false);
    }, 280);
  }, []);

  // Parse incoming serial lines
  const processSerialLine = useCallback(
    (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      addLog(trimmed, "serial");

      // Check for finger removed
      if (trimmed.toLowerCase().includes("no finger")) {
        setFingerDetected(false);
        setDeviceStatus("waiting_finger");
        setInstantBpm(0);
        setAvgBpm(0);
        setThalach(0);
        if (onThalachUpdateRef.current) onThalachUpdateRef.current(0);
        return;
      }

      if (trimmed.includes("MAX30102 detected") || trimmed.includes("Sensor initialized")) {
        setDeviceStatus("ready");
        return;
      }
      if (trimmed.includes("Place your finger on the sensor")) {
        setDeviceStatus("waiting_finger");
        setFingerDetected(false);
        return;
      }
      if (trimmed.includes("MAX30102 NOT FOUND")) {
        setDeviceStatus("error");
        setError("MAX30102 sensor was not detected. Please verify I2C wiring and power.");
        return;
      }

      // Check for confirmed Thalach
      const confirmedThalachMatch = trimmed.match(/>>>\s*THALACH CONFIRMED:\s*([\d.]+)/i);
      if (confirmedThalachMatch) {
        const val = parseFloat(confirmedThalachMatch[1]);
        if (!isNaN(val) && val > 0) {
          setThalach(val);
          if (onThalachUpdateRef.current) onThalachUpdateRef.current(val);
        }
        return;
      }

      // Check for Beat line
      const beatMatch = trimmed.match(/Beat:\s*([\d.]+)\s*BPM\s*\|\s*Avg:\s*([\d.]+)\s*BPM\s*\|\s*Thalach:\s*([\d.]+)/i);
      if (beatMatch) {
        const bBpm = parseFloat(beatMatch[1]);
        const bAvg = parseFloat(beatMatch[2]);
        const bThal = parseFloat(beatMatch[3]);

        setFingerDetected(true);
        setDeviceStatus("finger_detected");
        triggerPulse();

        if (!isNaN(bBpm) && bBpm > 0) setInstantBpm(bBpm);
        if (!isNaN(bAvg) && bAvg > 0) setAvgBpm(Math.round(bAvg));
        if (!isNaN(bThal) && bThal > 0) {
          setThalach(bThal);
          if (onThalachUpdateRef.current) onThalachUpdateRef.current(bThal);
        }
        return;
      }

      // Check for Status line
      const statusMatch = trimmed.match(/IR:\s*(\d+)\s*\|\s*BPM:\s*([\d.]+)\s*\|\s*Avg BPM:\s*([\d.]+)\s*\|\s*Thalach:\s*([\d.]+)/i);
      if (statusMatch) {
        const sIr = parseInt(statusMatch[1], 10);
        const sBpm = parseFloat(statusMatch[2]);
        const sAvg = parseFloat(statusMatch[3]);
        const sThal = parseFloat(statusMatch[4]);

        setIrValue(sIr);
        if (sIr > 50000) {
          setFingerDetected(true);
          setDeviceStatus("finger_detected");
        }

        if (!isNaN(sBpm) && sBpm > 0) setInstantBpm(sBpm);
        if (!isNaN(sAvg) && sAvg > 0) setAvgBpm(Math.round(sAvg));
        if (!isNaN(sThal) && sThal > 0) {
          setThalach(sThal);
          if (onThalachUpdateRef.current) onThalachUpdateRef.current(sThal);
        }
      }
    },
    [addLog, triggerPulse]
  );

  // Disconnect from active mode (USB, WiFi, or Simulation)
  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    if (wifiIntervalRef.current) {
      clearInterval(wifiIntervalRef.current);
      wifiIntervalRef.current = null;
    }

    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {
        // ignore
      }
      readerRef.current = null;
    }

    if (readableStreamClosedRef.current) {
      try {
        await readableStreamClosedRef.current.catch(() => {});
      } catch {
        // ignore
      }
      readableStreamClosedRef.current = null;
    }

    if (portRef.current) {
      try {
        await portRef.current.close();
      } catch {
        // ignore
      }
      portRef.current = null;
    }

    setIsConnected(false);
    setIsSimulating(false);
    setIsConnecting(false);
    setConnectionMode("none");
    setDeviceStatus("disconnected");
    setFingerDetected(false);
    setAvgBpm(0);
    setInstantBpm(0);
    setThalach(0);
    if (onThalachUpdateRef.current) onThalachUpdateRef.current(0);
    addLog("Wearable device disconnected.", "info");
  }, [addLog]);

  // Connect via native Web Serial API
  const connectSerial = useCallback(async () => {
    await disconnect();
    setError(null);

    if (!isWebSerialSupported) {
      setError(
        "Web Serial API is not supported in this browser. Please use Chrome/Edge or connect wirelessly over WiFi."
      );
      return;
    }

    try {
      setIsConnecting(true);
      addLog("Requesting Serial Port at 115200 baud...", "system");

      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      portRef.current = port;
      keepReadingRef.current = true;
      setIsConnected(true);
      setIsSimulating(false);
      setConnectionMode("serial");
      setDeviceStatus("ready");
      addLog("MAX30102 Connected on USB Serial at 115200 baud.", "success");

      const textDecoder = new TextDecoderStream();
      readableStreamClosedRef.current = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;

      let buffer = "";

      while (keepReadingRef.current) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          for (const line of lines) {
            processSerialLine(line);
          }
        } catch (chunkErr) {
          if (!keepReadingRef.current) break;
          console.warn("Serial chunk reading glitch:", chunkErr);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
    } catch (err) {
      if (err.name !== "NotFoundError") {
        setError(err.message || "Failed to open serial port.");
        addLog(`Serial connection error: ${err.message}`, "error");
      } else {
        addLog("Port selection cancelled.", "info");
      }
      setIsConnected(false);
      setConnectionMode("none");
      setDeviceStatus("disconnected");
    } finally {
      setIsConnecting(false);
    }
  }, [addLog, disconnect, isWebSerialSupported, processSerialLine]);

  // Connect wirelessly over WiFi with multi-candidate fallback (IP and mDNS)
  const connectWifi = useCallback(
    async (deviceHost = "192.168.8.108") => {
      await disconnect();
      setError(null);
      setIsConnecting(true);

      const primary = (deviceHost || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() || "192.168.8.108";
      const candidates = Array.from(new Set([primary, "192.168.8.108", "elara-wearable.local"])).filter(Boolean);

      let successfulHost = null;
      let initialData = null;

      for (const host of candidates) {
        addLog(`Connecting to Wearable Device via WiFi (${host})...`, "system");
        try {
          const res = await fetch(`http://${host}/data`, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            initialData = await res.json();
            successfulHost = host;
            break;
          }
        } catch {
          // Continue to next candidate
        }
      }

      if (!successfulHost || !initialData) {
        setError(
          `Unable to reach Wearable Device at http://${primary}/data. Ensure your computer is connected to WiFi (Mobitel_4G_B69AC) and the ESP32 is powered.`
        );
        addLog(`WiFi connection failed for candidates: ${candidates.join(", ")}`, "error");
        setIsConnected(false);
        setConnectionMode("none");
        setDeviceStatus("disconnected");
        setIsConnecting(false);
        return;
      }

      const targetUrl = `http://${successfulHost}/data`;
      setIsConnected(true);
      setIsSimulating(false);
      setConnectionMode("wifi");
      setDeviceStatus("ready");
      setDeviceWifiInfo({
        ip: initialData.ip || successfulHost,
        ssid: initialData.wifiSSID || "Mobitel_4G_B69AC",
        rssi: initialData.rssi,
      });

      addLog(`Connected to Wearable Device on WiFi (${successfulHost})! IP: ${initialData.ip}`, "success");

      // Polling loop every 600ms
      wifiIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(targetUrl, { signal: AbortSignal.timeout(1500) });
          if (!pollRes.ok) return;
          const data = await pollRes.json();

          setIrValue(data.ir || 0);

          if (data.fingerDetected) {
            setFingerDetected(true);
            setDeviceStatus("finger_detected");
            triggerPulse();

            if (data.bpm > 0) setInstantBpm(data.bpm);
            if (data.avgBpm > 0) setAvgBpm(data.avgBpm);
            if (data.thalach > 0) {
              setThalach(data.thalach);
              if (onThalachUpdateRef.current) onThalachUpdateRef.current(data.thalach);
            }

            addLog(
              `WiFi: Beat ${data.bpm} BPM | Avg: ${data.avgBpm} BPM | Thalach: ${data.thalach} BPM`,
              "wifi"
            );
          } else {
            // Finger removed over WiFi
            setFingerDetected(false);
            setDeviceStatus("waiting_finger");
            setInstantBpm(0);
            setAvgBpm(0);
            setThalach(0);
            if (onThalachUpdateRef.current) onThalachUpdateRef.current(0);
          }
        } catch {
          // Transient network packet drop
        }
      }, 650);

      setIsConnecting(false);
    },
    [addLog, disconnect, triggerPulse]
  );

  // High-fidelity Simulator
  const startSimulation = useCallback(async () => {
    await disconnect();
    setError(null);
    setIsConnected(true);
    setIsSimulating(true);
    setConnectionMode("simulated");
    setDeviceStatus("ready");
    addLog("Starting MAX30102 Wearable Device Simulation...", "system");

    const RATE_SIZE = 8;
    const THALACH_REQUIRED_POINTS = 3;
    const THALACH_TOLERANCE = 8.0;
    const THALACH_HISTORY_SIZE = 10;

    const rates = [];
    let rateSpot = 0;
    const thalachHistory = [];
    let confirmedThalach = 0;
    let tickCount = 0;

    simulationIntervalRef.current = setInterval(() => {
      tickCount++;
      const baseHeartRate = 74 + Math.sin(tickCount / 5) * 6;
      const noise = (Math.random() - 0.5) * 3;
      const simulatedBpm = Number((baseHeartRate + noise).toFixed(1));
      const simulatedIr = 94000 + Math.floor(Math.random() * 2500);

      rates[rateSpot] = simulatedBpm;
      rateSpot = (rateSpot + 1) % RATE_SIZE;
      const total = rates.reduce((sum, r) => sum + r, 0);
      const simulatedAvg = Math.round(total / rates.length);

      thalachHistory.push(simulatedBpm);
      if (thalachHistory.length > THALACH_HISTORY_SIZE) thalachHistory.shift();

      let highestConfirmed = 0;
      if (thalachHistory.length >= THALACH_REQUIRED_POINTS) {
        for (let i = 0; i < thalachHistory.length; i++) {
          const refBPM = thalachHistory[i];
          let similarCount = 0;
          let similarTotal = 0;

          for (let j = 0; j < thalachHistory.length; j++) {
            if (Math.abs(thalachHistory[j] - refBPM) <= THALACH_TOLERANCE) {
              similarCount++;
              similarTotal += thalachHistory[j];
            }
          }

          if (similarCount >= THALACH_REQUIRED_POINTS) {
            const confirmedValue = Number((similarTotal / similarCount).toFixed(1));
            if (confirmedValue > highestConfirmed) highestConfirmed = confirmedValue;
          }
        }
      }

      if (highestConfirmed > 0 && highestConfirmed > confirmedThalach) {
        confirmedThalach = highestConfirmed;
        processSerialLine(`>>> THALACH CONFIRMED: ${confirmedThalach.toFixed(1)} BPM`);
      }

      processSerialLine(
        `Beat: ${simulatedBpm.toFixed(1)} BPM | Avg: ${simulatedAvg} BPM | Thalach: ${
          confirmedThalach > 0 ? confirmedThalach.toFixed(1) : simulatedBpm.toFixed(1)
        } BPM`
      );

      if (tickCount % 3 === 0) {
        processSerialLine(
          `IR: ${simulatedIr} | BPM: ${simulatedBpm.toFixed(1)} | Avg BPM: ${simulatedAvg} | Thalach: ${
            confirmedThalach > 0 ? confirmedThalach.toFixed(1) : simulatedBpm.toFixed(1)
          } BPM`
        );
      }
    }, 850);
  }, [disconnect, addLog, processSerialLine]);

  // Stable unmount cleanup
  const disconnectRef = useRef(disconnect);
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  useEffect(() => {
    return () => {
      disconnectRef.current?.();
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, []);

  return {
    isConnected,
    isConnecting,
    isSimulating,
    connectionMode,
    deviceStatus,
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
  };
}
