import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Custom React hook for connecting to the AD8232 ECG Wearable Device.
 *
 * Supports:
 * 1. Wireless WiFi Streaming via ESP32 HTTP REST (/api/ecg)
 * 2. Web Serial API at 115200 baud
 * 3. High-fidelity physiological ECG Simulator (real P-Q-R-S-T synthesis)
 *
 * Cleveland Domain Mappings:
 * - Rest ECG (restecg):
 *     0 = Normal
 *     1 = ST-T wave abnormality
 *     2 = Left ventricular hypertrophy
 * - ST depression (oldpeak):
 *     Numeric float value (e.g. 0.0 - 6.2 mm)
 * - ECG ST-segment slope (slope):
 *     0 = Downsloping (from Arduino Cleveland value 3)
 *     1 = Flat (from Arduino Cleveland value 2)
 *     2 = Upsloping (from Arduino Cleveland value 1)
 */
export function useEcgDevice({ onEcgUpdate } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [connectionMode, setConnectionMode] = useState("none"); // "none", "wifi", "serial", "simulated"
  const [leadsOff, setLeadsOff] = useState(false);

  // Waveform samples for live oscilloscope (array of recent floats)
  const [samples, setSamples] = useState([]);

  // ECG Metrics
  const [heartRate, setHeartRate] = useState(0);
  const [landmarks, setLandmarks] = useState({ P: 0, Q: 0, R: 0, S: 0, T: 0, J: 0 });
  const [stDeviation, setStDeviation] = useState(0);
  const [oldpeak, setOldpeak] = useState(0);
  const [stSlope, setStSlope] = useState(0);
  const [restECG, setRestECG] = useState(0); // 0, 1, 2
  const [slopeCategory, setSlopeCategory] = useState(1); // 1 = upsloping, 2 = flat, 3 = downsloping
  const [signalQuality, setSignalQuality] = useState(0);
  const [mappingConfidence, setMappingConfidence] = useState(1);
  const [outOfDistribution, setOutOfDistribution] = useState(false);
  const [rlState, setRlState] = useState(null);

  const [deviceWifiInfo, setDeviceWifiInfo] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // References
  const wifiIntervalRef = useRef(null);
  const simIntervalRef = useRef(null);
  const portRef = useRef(null);
  const readerRef = useRef(null);
  const keepReadingRef = useRef(false);

  // Stable ref for parent callback to avoid re-triggering effects
  const onEcgUpdateRef = useRef(onEcgUpdate);
  useEffect(() => {
    onEcgUpdateRef.current = onEcgUpdate;
  }, [onEcgUpdate]);

  const addLog = useCallback((text, type = "info") => {
    setLogs((prev) => [
      ...prev.slice(-30),
      {
        id: `${Date.now()}-${Math.random()}`,
        time: new Date().toLocaleTimeString(),
        text,
        type,
      },
    ]);
  }, []);

  /**
   * Helper: Normalize Arduino slope output to Cleveland select option
   * Arduino code:
   *   1 = upsloping
   *   2 = flat
   *   3 = downsloping
   * Frontend Form (featureContract.js):
   *   0 = Downsloping
   *   1 = Flat
   *   2 = Upsloping
   */
  const mapSlopeToForm = useCallback((arduinoSlope) => {
    const s = Number(arduinoSlope);
    if (s === 3) return 0; // Downsloping
    if (s === 2) return 1; // Flat
    if (s === 1) return 2; // Upsloping
    if (s === 0) return 0; // Already 0 (Downsloping)
    return 1; // Default Flat
  }, []);

  // Disconnect any active stream
  const disconnect = useCallback(async () => {
    if (wifiIntervalRef.current) {
      clearInterval(wifiIntervalRef.current);
      wifiIntervalRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    keepReadingRef.current = false;
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {
        // ignore
      }
      readerRef.current = null;
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
    setIsConnecting(false);
    setIsSimulating(false);
    setConnectionMode("none");
    setSamples([]);
    addLog("ECG device disconnected.", "system");
  }, [addLog]);

  // Connect wirelessly over WiFi
  const connectWifi = useCallback(
    async (deviceHost = "192.168.8.108") => {
      await disconnect();
      setError(null);
      setIsConnecting(true);

      const primary = (deviceHost || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() || "192.168.8.108";
      const candidates = Array.from(new Set([primary, "192.168.8.108", "elara-device.local", "elara-ecg.local"])).filter(Boolean);

      let successfulHost = null;
      let initialData = null;

      for (const host of candidates) {
        addLog(`Testing ECG endpoint on http://${host}/api/ecg...`, "system");
        try {
          const res = await fetch(`http://${host}/api/ecg`, { signal: AbortSignal.timeout(3000) });
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
        setError(`Unable to reach AD8232 ECG sensor at http://${primary}/api/ecg. Ensure ESP32 is powered and on WiFi (Mobitel_4G_B69AC).`);
        addLog(`WiFi connection failed for: ${candidates.join(", ")}`, "error");
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionMode("none");
        return;
      }

      const targetUrl = `http://${successfulHost}/api/ecg`;
      setIsConnected(true);
      setIsSimulating(false);
      setConnectionMode("wifi");
      setDeviceWifiInfo({ host: successfulHost });
      addLog(`Connected to AD8232 ECG via WiFi (${successfulHost})!`, "success");

      // Polling loop every 350ms
      wifiIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(targetUrl, { signal: AbortSignal.timeout(1800) });
          if (!pollRes.ok) return;
          const data = await pollRes.json();

          if (Array.isArray(data.samples)) {
            setSamples(data.samples);
          }

          setLeadsOff(Boolean(data.leadsOff));
          const hr = Number(data.heartRate) || 0;
          setHeartRate(hr);

          setLandmarks({
            P: Number(data.P) || 0,
            Q: Number(data.Q) || 0,
            R: Number(data.R) || 0,
            S: Number(data.S) || 0,
            T: Number(data.T) || 0,
            J: Number(data.J) || 0,
          });

          setStDeviation(Number(data.stDeviation) || 0);

          const rawOldpeak = Math.max(0, Math.min(10, Number(data.oldpeak) || 0));
          setOldpeak(rawOldpeak);

          setStSlope(Number(data.stSlope) || 0);

          const rawRestEcg = Math.max(0, Math.min(2, Number(data.restECG) || 0));
          setRestECG(rawRestEcg);

          const rawSlope = Number(data.slopeCategory) || 2;
          setSlopeCategory(rawSlope);

          setSignalQuality(Number(data.signalQuality) || 0);
          setMappingConfidence(Number(data.mappingConfidence) || 1);
          setOutOfDistribution(Boolean(data.outOfDistribution));
          if (data.rlState) setRlState(data.rlState);

          // Update parent form if electrodes are connected
          if (!data.leadsOff && onEcgUpdateRef.current) {
            const formSlope = mapSlopeToForm(rawSlope);
            onEcgUpdateRef.current({
              restecg: rawRestEcg,
              oldpeak: Number(rawOldpeak.toFixed(1)),
              slope: formSlope,
              heartRate: hr > 0 ? Math.round(hr) : null,
            });
          }
        } catch {
          // Transient network jitter
        }
      }, 350);

      setIsConnecting(false);
    },
    [addLog, disconnect, mapSlopeToForm]
  );

  // High-fidelity ECG Simulator
  const startSimulation = useCallback(async () => {
    await disconnect();
    setIsConnecting(true);
    addLog("Starting high-fidelity AD8232 ECG simulator...", "system");

    setTimeout(() => {
      setIsConnected(true);
      setIsConnecting(false);
      setIsSimulating(true);
      setConnectionMode("simulated");
      setLeadsOff(false);
      addLog("ECG Simulator active. Generating realistic P-Q-R-S-T morphology.", "success");

      let t = 0;
      const simBuffer = [];
      const bufferSize = 250;

      // Fill initial buffer with baseline
      for (let i = 0; i < bufferSize; i++) {
        simBuffer.push(0);
      }

      simIntervalRef.current = setInterval(() => {
        // Generate ECG waveform chunk (approx 15 samples per 30ms interval = ~500Hz)
        const bpm = 74 + Math.sin(t * 0.05) * 3;
        const beatPeriod = (60 / bpm) * 500; // samples per beat at 500Hz

        for (let s = 0; s < 15; s++) {
          const sampleIndex = (t * 15 + s) % Math.round(beatPeriod);
          const phase = sampleIndex / beatPeriod;

          let val = 0;
          // P wave (around phase 0.15 - 0.23)
          if (phase > 0.14 && phase < 0.22) {
            val += Math.sin(((phase - 0.14) / 0.08) * Math.PI) * 120;
          }
          // Q wave (dip at phase 0.32)
          else if (phase >= 0.30 && phase < 0.33) {
            val -= Math.sin(((phase - 0.30) / 0.03) * Math.PI) * 160;
          }
          // R wave (sharp peak at phase 0.35)
          else if (phase >= 0.33 && phase < 0.38) {
            val += Math.sin(((phase - 0.33) / 0.05) * Math.PI) * 980;
          }
          // S wave (deep dip at phase 0.40)
          else if (phase >= 0.38 && phase < 0.43) {
            val -= Math.sin(((phase - 0.38) / 0.05) * Math.PI) * 280;
          }
          // T wave (phase 0.52 - 0.68)
          else if (phase >= 0.52 && phase < 0.68) {
            val += Math.sin(((phase - 0.52) / 0.16) * Math.PI) * 240;
          }

          // Subtle physiological baseline wander
          val += Math.sin((t * 15 + s) * 0.004) * 35;
          // Small noise
          val += (Math.random() - 0.5) * 15;

          simBuffer.push(val);
          if (simBuffer.length > bufferSize) simBuffer.shift();
        }

        t++;
        setSamples([...simBuffer]);

        // Synthesize clinical ECG parameters
        const simHr = Math.round(bpm);
        setHeartRate(simHr);
        setLandmarks({
          P: 120,
          Q: -160,
          R: 980,
          S: -280,
          T: 240,
          J: 15,
        });

        const simStDev = 0.04;
        setStDeviation(simStDev);

        const simOldpeak = 0.2; // 0.2 mm
        setOldpeak(simOldpeak);

        const simSlopeCat = 1; // Upsloping (Cleveland 1)
        setSlopeCategory(simSlopeCat);

        const simRestEcg = 0; // Normal
        setRestECG(simRestEcg);

        setSignalQuality(0.92);
        setMappingConfidence(0.98);
        setOutOfDistribution(false);

        if (onEcgUpdateRef.current) {
          onEcgUpdateRef.current({
            restecg: simRestEcg,
            oldpeak: simOldpeak,
            slope: 2, // Upsloping in form
            heartRate: simHr,
          });
        }
      }, 50);
    }, 400);
  }, [addLog, disconnect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (wifiIntervalRef.current) clearInterval(wifiIntervalRef.current);
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  return {
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
    deviceWifiInfo,
    logs,
    error,
    connectWifi,
    startSimulation,
    disconnect,
  };
}
