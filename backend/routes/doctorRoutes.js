const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const {
  getOwnProfile,
  listAssignedPatients,
  getAssignedPatientProfile,
} = require("../controllers/doctorController");
const { getPatientHistoryForDoctor } = require("../controllers/predictionController");
const {
  listIncomingRequests,
  acceptRequest,
  declineRequest,
} = require("../controllers/connectionRequestController");

router.use(authenticate, authorize("doctor"));

// GET /api/doctors/me
router.get("/me", asyncHandler(getOwnProfile));

// GET /api/doctors/me/patients
router.get("/me/patients", asyncHandler(listAssignedPatients));

// GET /api/doctors/me/patients/:patientId
router.get("/me/patients/:patientId", asyncHandler(getAssignedPatientProfile));

// GET /api/doctors/me/patients/:patientId/predictions
router.get("/me/patients/:patientId/predictions", asyncHandler(getPatientHistoryForDoctor));

// GET /api/doctors/me/connection-requests -- pending requests awaiting this doctor's response
router.get("/me/connection-requests", asyncHandler(listIncomingRequests));

// POST /api/doctors/me/connection-requests/:requestId/accept
router.post("/me/connection-requests/:requestId/accept", asyncHandler(acceptRequest));

// POST /api/doctors/me/connection-requests/:requestId/decline
router.post("/me/connection-requests/:requestId/decline", asyncHandler(declineRequest));

module.exports = router;
