# IoT Health-Data Acquisition

This directory contains the ESP32 firmware and communication contract for
IoT-based health data acquisition, following the project's product
requirements and canonical data contract.

## Status

No existing ESP32/sensor implementation was found in the legacy project
(`existing-project-continuation/Full Stack/Application/IoT - empty/` was an
empty placeholder). This is a scaffold for the intended device-to-backend
flow, not a finished, hardware-tested firmware.

## Structure

- `firmware/` - Arduino/ESP32 sketch scaffold that reads sensor values and
  posts a subset of the ten canonical model features to the backend.
- `communication/` - The device-to-backend HTTP contract (registration,
  authentication, and data ingest), and the mapping from raw sensor readings
  to canonical model features.

## Data flow

```text
ESP32 + sensors (MAX30102, ECG lead, BP module)
        |
        v
Raw sensor readings (heart rate, SpO2, ECG-derived values, BP, glucose)
        |
        v
Only readings that map to the 10 canonical features are selected
        |
        v
HTTPS POST /api/iot/ingest  (device identifier + device key)
        |
        v
backend/controllers/iotController.js -> health_data table (source='iot')
        |
        v
Patient can trigger a prediction using this data from the dashboard
```

Only measurements that map to the defined ten model features should be
sent to the prediction pipeline. Any sensor reading that does not
correspond to one of the ten canonical features (see
`backend/utils/featureContract.js`) must not be forwarded to
`/api/iot/ingest`.
