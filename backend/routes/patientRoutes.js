const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { getOwnProfile, getOwnHealthHistory } = require("../controllers/patientController");
const {
  listAvailableDoctors,
  listMyDoctors,
  listOwnRequests,
  sendRequest,
  cancelRequest,
} = require("../controllers/connectionRequestController");

router.use(authenticate, authorize("patient"));

// GET /api/patients/me
router.get("/me", asyncHandler(getOwnProfile));

// GET /api/patients/me/health-data
router.get("/me/health-data", asyncHandler(getOwnHealthHistory));

// GET /api/patients/me/doctors -- doctors already connected with
router.get("/me/doctors", asyncHandler(listMyDoctors));

// GET /api/patients/me/doctors/available -- approved doctors not yet connected
router.get("/me/doctors/available", asyncHandler(listAvailableDoctors));

// GET /api/patients/me/connection-requests
router.get("/me/connection-requests", asyncHandler(listOwnRequests));

// POST /api/patients/me/connection-requests  { doctorId }
router.post("/me/connection-requests", asyncHandler(sendRequest));

// POST /api/patients/me/connection-requests/:requestId/cancel
router.post("/me/connection-requests/:requestId/cancel", asyncHandler(cancelRequest));

module.exports = router;
