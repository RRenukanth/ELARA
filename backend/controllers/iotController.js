const bcrypt = require("bcrypt");
const iotDeviceModel = require("../models/iotDeviceModel");
const healthDataModel = require("../models/healthDataModel");
const { extractCanonicalFeatures } = require("../utils/featureContract");
const { HttpError } = require("../middleware/errorHandler");
const { isNonEmptyString } = require("../utils/validators");

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

// =========================================================
// PATIENT REGISTERS THEIR OWN IOT DEVICE
// Identity comes from the authenticated patient (JWT), not the request body.
// =========================================================
async function registerDevice(req, res) {
  const patientId = req.user.id;
  const { deviceIdentifier, deviceType } = req.body;

  if (!isNonEmptyString(deviceIdentifier, 100)) {
    throw new HttpError(400, "A device identifier is required.");
  }

  if (iotDeviceModel.findByIdentifier(deviceIdentifier)) {
    throw new HttpError(409, "This device is already registered.");
  }

  // Generate a device key returned once to the caller (used by firmware to
  // authenticate ingest requests); only the hash is persisted.
  const deviceKey = require("crypto").randomBytes(24).toString("hex");
  const deviceKeyHash = await bcrypt.hash(deviceKey, SALT_ROUNDS);

  const device = iotDeviceModel.register(patientId, deviceIdentifier, deviceKeyHash, deviceType);

  return res.status(201).json({
    message: "Device registered. Store this device key securely -- it will not be shown again.",
    device: iotDeviceModel.toPublicView(device),
    deviceKey,
  });
}

function listOwnDevices(req, res) {
  const devices = iotDeviceModel.listForPatient(req.user.id).map(iotDeviceModel.toPublicView);
  return res.status(200).json({ devices });
}

// =========================================================
// DEVICE DATA INGEST
// Only the ten canonical features that map to the model contract are
// accepted (see data-contract.md); the device must authenticate with its
// registered identifier + key (validated against the stored hash).
// =========================================================
async function ingestReading(req, res) {
  const { deviceIdentifier, deviceKey, ...payload } = req.body;

  if (!isNonEmptyString(deviceIdentifier, 100) || !isNonEmptyString(deviceKey, 200)) {
    throw new HttpError(400, "deviceIdentifier and deviceKey are required.");
  }

  const device = iotDeviceModel.findByIdentifier(deviceIdentifier);
  if (!device) {
    throw new HttpError(401, "Unknown device.");
  }

  const keyMatches = await bcrypt.compare(deviceKey, device.device_key_hash);
  if (!keyMatches) {
    throw new HttpError(401, "Invalid device key.");
  }

  const { valid, errors, features } = extractCanonicalFeatures(payload);
  if (!valid) {
    throw new HttpError(400, errors.join(" "));
  }

  iotDeviceModel.markConnected(deviceIdentifier);
  const healthRecord = healthDataModel.create(device.patient_id, features, "iot");

  return res.status(201).json({
    message: "Reading recorded.",
    healthId: healthRecord.health_id,
  });
}

module.exports = { registerDevice, listOwnDevices, ingestReading };
