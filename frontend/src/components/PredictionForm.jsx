import { useState, useEffect } from "react";
import { FEATURE_FIELDS } from "../utils/featureContract.js";

const initialValues = FEATURE_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: "" }), {});

/**
 * PredictionForm
 *
 * thalach (Maximum Heart Rate) is special: it must be captured AFTER the
 * patient exercises, not at rest. The form therefore blocks auto-fill of
 * thalach until the patient explicitly presses "Start Measuring" via the
 * inline readiness prompt. All other IoT auto-fills (ECG: restecg, oldpeak,
 * slope) work as usual from the moment the AD8232 is connected.
 *
 * Props:
 *   onSubmit             â€“ called with the 10-feature payload object
 *   isSubmitting         â€“ disables the submit button while the API call runs
 *   externalThalach      â€“ live thalach BPM from useWearableDevice (gated)
 *   externalEcg          â€“ { restecg, oldpeak, slope } from useEcgDevice
 *   thalachReady         â€“ whether the user has opted in to live thalach fill
 *   onThalachReadyChange â€“ setter to toggle thalachReady in parent
 */
export default function PredictionForm({
  onSubmit,
  isSubmitting,
  externalThalach,
  externalEcg,
  thalachReady,
  onThalachReadyChange,
  wearableConnected,
}) {
  const [values, setValues] = useState(initialValues);

  // Sync thalach from device ONLY when the user has signalled they are ready
  useEffect(() => {
    if (!thalachReady) return;
    if (externalThalach !== undefined && externalThalach !== null) {
      const num = Number(externalThalach);
      if (num > 0) {
        setValues((prev) => ({ ...prev, thalach: Math.round(num) }));
      } else {
        // Finger removed while measuring: clear the field so the user must
        // re-place their finger and get a fresh reading.
        setValues((prev) => ({ ...prev, thalach: "" }));
      }
    }
  }, [externalThalach, thalachReady]);

  // Sync ECG values (restecg, oldpeak, slope) from AD8232 ECG sensor
  useEffect(() => {
    if (externalEcg) {
      setValues((prev) => ({
        ...prev,
        ...(externalEcg.restecg !== undefined && externalEcg.restecg !== null
          ? { restecg: externalEcg.restecg }
          : {}),
        ...(externalEcg.oldpeak !== undefined && externalEcg.oldpeak !== null
          ? { oldpeak: externalEcg.oldpeak }
          : {}),
        ...(externalEcg.slope !== undefined && externalEcg.slope !== null
          ? { slope: externalEcg.slope }
          : {}),
      }));
    }
  }, [externalEcg]);

  function update(key) {
    return (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const payload = {};
    for (const field of FEATURE_FIELDS) {
      payload[field.key] = Number(values[field.key]);
    }
    onSubmit(payload);
  }

  // Derived thalach states for the UI
  // thalachReady===true  â†’ user said Yes, auto-fill active
  // thalachReady===false â†’ initial state, show the Yes/No prompt
  // thalachReady===null  â†’ user said No, prompt dismissed, manual entry
  const isThalachSynced = thalachReady === true && externalThalach > 0;
  // deviceConnected: true when the wearable sensor is physically connected (regardless of BPM value)
  const deviceConnected = !!wearableConnected;
  // Show the Yes/No prompt only when device is connected AND user hasn't answered yet
  const showReadinessPrompt = thalachReady === false && deviceConnected;

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {FEATURE_FIELDS.map((field) => {
        const isEcgSynced =
          externalEcg &&
          (field.key === "restecg" || field.key === "oldpeak" || field.key === "slope");

        // â”€â”€ Thalach field gets special treatment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (field.key === "thalach") {
          return (
            <div key="thalach" className="sm:col-span-2">
              {/* Label row */}
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">{field.label}</label>
                {isThalachSynced && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cyan-950/80 border border-cyan-400/40 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                    PPG Live â€” Peak Captured
                  </span>
                )}
                {thalachReady && !isThalachSynced && deviceConnected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/80 border border-amber-400/40 px-2 py-0.5 text-[11px] font-semibold text-amber-300 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Place finger on sensorâ€¦
                  </span>
                )}
              </div>

              {/* â”€â”€ Readiness prompt: Yes / No â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                  Shown when the wearable device is connected but the user
                  hasn't confirmed they've exercised and are ready to capture
                  their peak heart rate yet.                               */}
              {showReadinessPrompt && (
                <div className="mb-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-4">
                  {/* Question */}
                  <div className="flex items-start gap-3 mb-4">
                    <span className="text-2xl select-none">ðŸƒ</span>
                    <div>
                      <p className="text-sm font-bold text-cyan-100">
                        Are you ready to measure your maximum heart rate?
                      </p>
                      <p className="mt-1 text-xs text-cyan-400 leading-relaxed">
                        Complete some light exercise first (e.g. jog in place, jumping
                        jacks) to raise your heart rate. Then click{" "}
                        <strong className="text-cyan-200">Yes, Start Measuring</strong> and
                        place your finger on the MAX30102 sensor â€” the device will
                        automatically capture and fill in your peak BPM.
                      </p>
                    </div>
                  </div>

                  {/* Yes / No button row */}
                  <div className="flex items-center gap-3">
                    {/* YES â€” enables live thalach capture */}
                    <button
                      type="button"
                      onClick={() => onThalachReadyChange && onThalachReadyChange(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/60 bg-cyan-900/70 px-5 py-2.5 text-sm font-bold text-cyan-100 shadow-[0_0_16px_rgba(63,224,255,0.3)] transition hover:bg-cyan-700/80 hover:text-white hover:shadow-[0_0_24px_rgba(63,224,255,0.55)] active:scale-95"
                    >
                      <svg className="h-4 w-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      Yes, Start Measuring
                    </button>

                    {/* NO â€” user will type value manually; collapses the prompt */}
                    <button
                      type="button"
                      onClick={() => onThalachReadyChange && onThalachReadyChange(null)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-neon-300 transition hover:bg-white/10 hover:text-white active:scale-95"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536M9 11l-4 4v3h3l4-4M16 7l-3-3" />
                      </svg>
                      No, I'll type it manually
                    </button>
                  </div>
                </div>
              )}

              {/* If device is not connected at all, show normal instruction */}
              {!deviceConnected && (
                <p className="mb-2 text-xs text-neon-400">
                  Connect the wearable sensor above to auto-fill this field after exercise.
                </p>
              )}

              {/* User chose "No" â€” show manual entry note + option to re-ask */}
              {thalachReady === null && (
                <p className="mb-2 text-xs text-neon-400">
                  Entering manually.{" "}
                  <button
                    type="button"
                    onClick={() => onThalachReadyChange && onThalachReadyChange(false)}
                    className="underline hover:text-neon-200"
                  >
                    Use sensor instead?
                  </button>
                </p>
              )}

              {/* Active measuring mode: Yes was pressed */}
              {thalachReady === true && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs text-cyan-300">
                    âš¡ Measuring peak heart rate â€” place your finger on the sensor now.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onThalachReadyChange && onThalachReadyChange(false);
                      setValues((prev) => ({ ...prev, thalach: "" }));
                    }}
                    className="ml-auto text-[11px] text-neon-400 underline hover:text-neon-200"
                  >
                    Re-ask
                  </button>
                </div>
              )}

              {/* The actual input field */}
              <div className="relative">
                <input
                  type="number"
                  step={field.step || "1"}
                  min={field.min}
                  max={field.max}
                  className={`input-field ${
                    isThalachSynced
                      ? "border-cyan-400/60 bg-cyan-950/20 text-cyan-50 focus:border-cyan-400 focus:ring-cyan-500/50 shadow-[0_0_12px_rgba(63,224,255,0.12)]"
                      : ""
                  }`}
                  value={values.thalach}
                  onChange={update("thalach")}
                  placeholder={thalachReady ? "Waiting for sensor readingâ€¦" : "BPM (e.g. 150)"}
                  readOnly={isThalachSynced}
                  required
                />
                {isThalachSynced && (
                  <p className="mt-1 text-xs text-cyan-300/80">
                    âš¡ Auto-filled from wearable heart rate sensor ({Math.round(externalThalach)}{" "}
                    BPM â€” captured after exercise).
                  </p>
                )}
              </div>
            </div>
          );
        }

        // â”€â”€ All other fields â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        return (
          <div key={field.key}>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">{field.label}</label>
              {isEcgSynced && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/80 border border-emerald-400/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ECG Synced
                </span>
              )}
            </div>

            {field.type === "select" ? (
              <div className="relative">
                <select
                  className={`input-field ${
                    isEcgSynced
                      ? "border-emerald-400/60 bg-emerald-950/20 text-emerald-50 focus:border-emerald-400 focus:ring-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
                      : ""
                  }`}
                  value={values[field.key]}
                  onChange={update(field.key)}
                  required
                >
                  <option value="">Select</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {isEcgSynced && field.key === "restecg" && (
                  <p className="mt-1 text-xs text-emerald-300/80">
                    âš¡ Auto-filled from AD8232 ECG (
                    {values.restecg === 0
                      ? "Normal"
                      : values.restecg === 1
                      ? "ST-T Wave Abnormality"
                      : "Left Ventricular Hypertrophy"}
                    ).
                  </p>
                )}

                {isEcgSynced && field.key === "slope" && (
                  <p className="mt-1 text-xs text-emerald-300/80">
                    âš¡ Auto-filled from AD8232 ECG (
                    {values.slope === 0
                      ? "Downsloping"
                      : values.slope === 1
                      ? "Flat"
                      : "Upsloping"}
                    ).
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  step={field.step || "1"}
                  min={field.min}
                  max={field.max}
                  className={`input-field ${
                    isEcgSynced
                      ? "border-emerald-400/60 bg-emerald-950/20 text-emerald-50 focus:border-emerald-400 focus:ring-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
                      : ""
                  }`}
                  value={values[field.key]}
                  onChange={update(field.key)}
                  placeholder={field.help}
                  required
                />

                {isEcgSynced && field.key === "oldpeak" && (
                  <p className="mt-1 text-xs text-emerald-300/80">
                    âš¡ Auto-filled from AD8232 ECG ({values.oldpeak} mm ST depression).
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Analyzing..." : "Get Risk Assessment"}
        </button>
      </div>
    </form>
  );
}
