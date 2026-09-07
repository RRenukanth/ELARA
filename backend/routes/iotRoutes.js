const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { registerDevice, listOwnDevices, ingestReading } = require("../controllers/iotController");

// Device data ingest authenticates via deviceIdentifier + deviceKey in the
// body (checked against the stored hash), NOT via patient JWT -- the
// firmware itself cannot hold a patient's login session.
// POST /api/iot/ingest
router.post("/ingest", asyncHandler(ingestReading));

// Everything else requires an authenticated patient.
router.use(authenticate, authorize("patient"));

// POST /api/iot/devices
router.post("/devices", asyncHandler(registerDevice));

// GET /api/iot/devices
router.get("/devices", asyncHandler(listOwnDevices));

module.exports = router;
