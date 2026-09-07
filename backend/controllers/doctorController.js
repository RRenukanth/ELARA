const doctorModel = require("../models/doctorModel");
const patientModel = require("../models/patientModel");
const { HttpError } = require("../middleware/errorHandler");

function getOwnProfile(req, res) {
  const doctor = doctorModel.findById(req.user.id);
  if (!doctor) {
    throw new HttpError(404, "Doctor not found.");
  }
  return res.status(200).json({ doctor: doctorModel.toPublicProfile(doctor) });
}

// Only patients explicitly assigned to this doctor via doctor_patient_assignments
// are returned -- never an arbitrary/unrestricted patient list.
function listAssignedPatients(req, res) {
  const doctorId = req.user.id;
  const patientIds = doctorModel.assignedPatientIds(doctorId);
  const patients = patientIds
    .map((id) => patientModel.findById(id))
    .filter(Boolean)
    .map(patientModel.toPublicProfile);

  return res.status(200).json({ patients });
}

function getAssignedPatientProfile(req, res) {
  const doctorId = req.user.id;
  const patientId = Number(req.params.patientId);

  if (!doctorModel.isPatientAssignedToDoctor(doctorId, patientId)) {
    throw new HttpError(403, "This patient is not assigned to you.");
  }

  const patient = patientModel.findById(patientId);
  if (!patient) {
    throw new HttpError(404, "Patient not found.");
  }

  return res.status(200).json({ patient: patientModel.toPublicProfile(patient) });
}

module.exports = { getOwnProfile, listAssignedPatients, getAssignedPatientProfile };
