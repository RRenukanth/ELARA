const express = require("express");
const router = express.Router();
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const {
  listPendingDoctors,
  approveDoctor,
  rejectDoctor,
  assignPatientToDoctor,
  listPatientsDeidentified,
  getGlobalExplanation,
} = require("../controllers/adminController");

router.use(authenticate, authorize("admin"));

// GET /api/admin/doctors/pending
router.get("/doctors/pending", asyncHandler(listPendingDoctors));

// POST /api/admin/doctors/:doctorId/approve
router.post("/doctors/:doctorId/approve", asyncHandler(approveDoctor));

// POST /api/admin/doctors/:doctorId/reject
router.post("/doctors/:doctorId/reject", asyncHandler(rejectDoctor));

// POST /api/admin/doctors/:doctorId/assign-patient
router.post("/doctors/:doctorId/assign-patient", asyncHandler(assignPatientToDoctor));

// GET /api/admin/patients/deidentified
router.get("/patients/deidentified", asyncHandler(listPatientsDeidentified));

// GET /api/admin/hrflm/global-explanation
// HRFLM global model-behavior explanation -- admin-only. HRFLM's intended
// audience is developers/researchers/authorized model analysts; access is
// restricted here to admin.
router.get("/hrflm/global-explanation", asyncHandler(getGlobalExplanation));

module.exports = router;
