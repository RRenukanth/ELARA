# Device <-> Backend Communication Contract

This describes the actual HTTP contract implemented in
`backend/controllers/iotController.js` and `backend/routes/iotRoutes.js`.
Keep this document in sync if those routes change.

## 1. Device registration (one-time, done by the patient via the app)

The **patient** (not the device) registers a device from their dashboard,
authenticated with their own patient JWT:

```
POST /api/iot/devices
Authorization: Bearer <patient JWT>
Content-Type: application/json

{
  "deviceIdentifier": "esp32-<unique-id>",
  "deviceType": "ESP32"
}
```

Response (only shown once - store it on the device, e.g. in NVS/EEPROM):

```json
{
  "message": "Device registered. Store this device key securely -- it will not be shown again.",
  "device": { "deviceId": 1, "deviceIdentifier": "esp32-abc123", "deviceType": "ESP32", "status": "disconnected" },
  "deviceKey": "<long random hex string>"
}
```

The device key is hashed (bcrypt) server-side before storage
(`iot_devices.device_key_hash`) -- the plaintext key is never persisted or
retrievable again after this response.

## 2. Data ingest (done by the firmware, no patient session)

The firmware cannot hold a patient's login session, so it authenticates each
ingest request with `deviceIdentifier` + `deviceKey` directly:

```
POST /api/iot/ingest
Content-Type: application/json

{
  "deviceIdentifier": "esp32-abc123",
  "deviceKey": "<the key from step 1>",

  "thalach": 132,
  "restecg": 0,
  "oldpeak": 0.4,
  "slope": 1,
  "age": 45,
  "sex": 1,
  "cp": 1,
  "exang": 0,
  "trestbps": 118,
  "fbs": 0
}
```

All ten canonical features (see `feature-mapping.md`) are validated
server-side against the same rules used for manual patient input
(`backend/utils/featureContract.js`). Invalid or out-of-range values are
rejected with HTTP 400. An incorrect `deviceKey` is rejected with HTTP 401.

On success, a `health_data` row is created with `source = 'iot'`, and it
appears in the patient's health history the same way manually-entered data
does. It does **not** automatically trigger a prediction -- the patient (or
a future automated job) still calls `POST /api/predictions` to generate a
risk assessment from the most recent readings.

## 3. Transport security

This contract assumes HTTPS in any real deployment. Plain HTTP is acceptable
only for local development/bench testing on a trusted network. The device
key functions like a password for that device and must be treated with the
same care (never logged, never committed to source control).
