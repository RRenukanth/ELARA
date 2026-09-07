const doctorModel = require("../models/doctorModel");
const patientModel = require("../models/patientModel");
const hrflmService = require("../services/hrflmService");
const { HttpError } = require("../middleware/errorHandler");
const { isValidUsername } = require("../utils/validators");

// =========================================================
// DOCTOR APPROVAL WORKFLOW
// =========================================================
function listPendingDoctors(req, res) {
  const doctors = doctorModel.listPending().map(doctorModel.toPublicProfile);
  return res.status(200).json({ doctors });
}

function approveDoctor(req, res) {
  const doctorId = Number(req.params.doctorId);
  const doctor = doctorModel.findById(doctorId);
  if (!doctor) {
    throw new HttpError(404, "Doctor not found.");
  }
  const updated = doctorModel.setApprovalStatus(doctorId, "approved");
  return res.status(200).json({ message: "Doctor approved.", doctor: doctorModel.toPublicProfile(updated) });
}

function rejectDoctor(req, res) {
  const doctorId = Number(req.params.doctorId);
  const doctor = doctorModel.findById(doctorId);
  if (!doctor) {
    throw new HttpError(404, "Doctor not found.");
  }
  const updated = doctorModel.setApprovalStatus(doctorId, "rejected");
  return res.status(200).json({ message: "Doctor rejected.", doctor: doctorModel.toPublicProfile(updated) });
}

// =========================================================
// DOCTOR <-> PATIENT ASSIGNMENT MANAGEMENT
// =========================================================
function assignPatientToDoctor(req, res) {
  const doctorId = Number(req.params.doctorId);
  const { patientId } = req.body;

  const doctor = doctorModel.findById(doctorId);
  if (!doctor) {
    throw new HttpError(404, "Doctor not found.");
  }
  const patient = patientModel.findById(Number(patientId));
  if (!patient) {
    throw new HttpError(404, "Patient not found.");
  }

  doctorModel.assignPatient(doctorId, patient.patient_id);
  return res.status(200).json({ message: "Patient assigned to doctor." });
}

// =========================================================
// DE-IDENTIFIED MODEL-ANALYSIS LISTING (no PII exposed)
// =========================================================
function listPatientsDeidentified(req, res) {
  // Placeholder for developer/researcher model-analysis views. Intentionally
  // does not expose name/email/phone -- only technical identifiers.
  return res.status(200).json({
    message: "De-identified patient listing is not yet implemented beyond this stub.",
    patients: [],
  });
}

// =========================================================
// HRFLM GLOBAL EXPLANATION (admin-only, see explainability.md / product.md)
// Contains only aggregate/global feature-importance statistics -- no
// patient-identifying information is ever included in this report.
// =========================================================
function getGlobalExplanation(req, res) {
  const explanation = hrflmService.getGlobalExplanation();
  return res.status(200).json(explanation);
}

module.exports = {
  listPendingDoctors,
  approveDoctor,
  rejectDoctor,
  assignPatientToDoctor,
  listPatientsDeidentified,
  getGlobalExplanation,
};
