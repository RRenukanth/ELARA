# Sensor Reading -> Canonical Feature Mapping

Only readings that map to one of the ten canonical features may be sent
to `/api/iot/ingest`. This table is the single source of truth for that
mapping; the firmware scaffold in
`../firmware/` implements it in `feature_mapping.h`.

| Canonical feature | Meaning | Candidate device input | Notes |
|---|---|---|---|
| `thalach` | Maximum heart rate | MAX30102 (PPG heart rate) during an exertion window | Requires an activity/exercise protocol to be meaningful; a single resting reading is not equivalent to a clinical max-HR test. |
| `restecg` | Resting ECG result | ECG lead (e.g. AD8232) classified into 0/1/2 | Requires signal processing/classification not yet implemented; out of scope for the firmware scaffold. |
| `oldpeak` | ST depression induced by exercise | Derived from ECG during exercise vs. rest | Same caveat as `restecg`; needs a validated ECG analysis pipeline. |
| `slope` | Slope of peak exercise ST segment | Derived from ECG | Same caveat as above. |
| `age` | Age | Not a sensor reading | Comes from the patient's profile, not a device. |
| `sex` | Sex | Not a sensor reading | Comes from the patient's profile, not a device. |
| `cp` | Chest pain type | Not a sensor reading | Patient-reported symptom, entered manually. |
| `exang` | Exercise-related chest discomfort | Not a sensor reading | Patient-reported symptom, entered manually. |
| `trestbps` | Resting blood pressure | Oscillometric BP module (e.g. cuff-based sensor) | Only include when the device has a validated BP module wired in. |
| `fbs` | Fasting blood sugar indicator | Glucometer/glucose sensor, thresholded at 120 mg/dL | Only include when a glucose sensor is present and calibrated. |

## Implication for the firmware scaffold

Because `restecg`, `oldpeak`, and `slope` require ECG waveform analysis that
is not implemented in `../firmware/elara_device.ino` (an intentional
placeholder, not a real analysis pipeline), the scaffold only demonstrates
sending `thalach` (heart rate) and, if a BP module is attached, `trestbps`.
It sends `null`/omits the other features rather than fabricating values --
the backend's `extractCanonicalFeatures()` validation will reject an ingest
payload that is missing required fields, which is intentional: it prevents
a partially-instrumented device from silently sending fabricated data for
features it cannot actually measure.

A future increment should either:
1. Add real ECG signal processing to derive `restecg`/`oldpeak`/`slope`, or
2. Keep IoT ingest limited to `thalach`/`trestbps`/`fbs` and require the
   patient to manually confirm/enter the remaining features before a
   prediction is requested (this is how the current patient dashboard
   already works -- IoT data supplements, but does not replace, the manual
   prediction form).
