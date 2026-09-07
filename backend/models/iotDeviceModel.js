const { get, all, run } = require("../database/db");

function findByIdentifier(deviceIdentifier) {
  return get("SELECT * FROM iot_devices WHERE device_identifier = ?", [deviceIdentifier]);
}

function findByIdForPatient(deviceId, patientId) {
  return get("SELECT * FROM iot_devices WHERE device_id = ? AND patient_id = ?", [
    deviceId,
    patientId,
  ]);
}

function listForPatient(patientId) {
  return all("SELECT * FROM iot_devices WHERE patient_id = ? ORDER BY created_at DESC", [
    patientId,
  ]);
}

function register(patientId, deviceIdentifier, deviceKeyHash, deviceType = "ESP32") {
  const result = run(
    `INSERT INTO iot_devices (patient_id, device_identifier, device_key_hash, device_type)
     VALUES (?, ?, ?, ?)`,
    [patientId, deviceIdentifier, deviceKeyHash, deviceType]
  );
  return get("SELECT * FROM iot_devices WHERE device_id = ?", [Number(result.lastInsertRowid)]);
}

function markConnected(deviceIdentifier) {
  run(
    "UPDATE iot_devices SET status = 'connected', last_seen_at = CURRENT_TIMESTAMP WHERE device_identifier = ?",
    [deviceIdentifier]
  );
}

function toPublicView(device) {
  return {
    deviceId: device.device_id,
    deviceIdentifier: device.device_identifier,
    deviceType: device.device_type,
    status: device.status,
    lastSeenAt: device.last_seen_at,
  };
}

module.exports = {
  findByIdentifier,
  findByIdForPatient,
  listForPatient,
  register,
  markConnected,
  toPublicView,
};
