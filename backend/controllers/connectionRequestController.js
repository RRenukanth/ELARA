// Patient <-> Doctor connection request workflow.
//
// Primary path for creating a doctor_patient_assignments row: the patient
// browses admin-approved doctors and sends a request; the doctor accepts or
// declines from their own request queue. Patient/doctor identity always
// comes from req.user (JWT) -- never a client-supplied id -- consistent
// with every other controller in this app (see security-and-privacy.md).

const doctorModel = require("../models/doctorModel");
const patientModel = require("../models/patientModel");
const connectionRequestModel = require("../models/connectionRequestModel");
const { HttpError } = require("../middleware/errorHandler");

// =========================================================
// PATIENT-FACING: browse doctors, send/cancel requests, view own requests
// =========================================================

// GET /api/patients/me/doctors/available
// Admin-approved doctors the patient does not already have an accepted
// assignment with (already-assigned doctors show up under "My Doctors" instead).
function listAvailableDoctors(req, res) {
  const patientId = req.user.id;

  const allApproved = doctorModel.listApproved();
  const assignedDoctors = doctorModel.listAssignedDoctorsForPatient(patientId);
  const assignedDoctorIds = new Set(assignedDoctors.map((d) => d.doctor_id));

  const available = allApproved.filter((d) => !assignedDoctorIds.has(d.doctor_id));

  return res.status(200).json({ doctors: available.map(doctorModel.toPublicDirectoryProfile) });
}

// GET /api/patients/me/doctors -- doctors already connected (accepted requests
// or admin-assigned).
function listMyDoctors(req, res) {
  const patientId = req.user.id;
  const doctors = doctorModel.listAssignedDoctorsForPatient(patientId);
  return res.status(200).json({ doctors: doctors.map(doctorModel.toPublicDirectoryProfile) });
}

// GET /api/patients/me/connection-requests
function listOwnRequests(req, res) {
  const requests = connectionRequestModel.listForPatient(req.user.id);
  return res.status(200).json({ requests: requests.map(connectionRequestModel.toPatientView) });
}

// POST /api/patients/me/connection-requests  { doctorId }
function sendRequest(req, res) {
  const patientId = req.user.id;
  const doctorId = Number(req.body.doctorId);

  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    throw new HttpError(400, "A valid doctorId is required.");
  }

  const doctor = doctorModel.findById(doctorId);
  if (!doctor || doctor.approval_status !== "approved") {
    throw new HttpError(404, "Doctor not found or not currently accepting requests.");
  }

  if (doctorModel.isPatientAssignedToDoctor(doctorId, patientId)) {
    throw new HttpError(409, "You are already connected with this doctor.");
  }

  if (connectionRequestModel.findPendingRequest(patientId, doctorId)) {
    throw new HttpError(409, "You already have a pending request to this doctor.");
  }

  const request = connectionRequestModel.create(patientId, doctorId);
  return res.status(201).json({
    message: "Connection request sent.",
    request: connectionRequestModel.toPatientView({
      ...request,
      doctor_first_name: doctor.first_name,
      doctor_last_name: doctor.last_name,
      doctor_hospital_name: doctor.hospital_name,
      doctor_specialization: doctor.specialization,
    }),
  });
}

// POST /api/patients/me/connection-requests/:requestId/cancel
function cancelRequest(req, res) {
  const patientId = req.user.id;
  const requestId = Number(req.params.requestId);

  const request = connectionRequestModel.findById(requestId);
  if (!request || request.patient_id !== patientId) {
    throw new HttpError(404, "Request not found.");
  }
  if (request.status !== "pending") {
    throw new HttpError(400, "Only a pending request can be cancelled.");
  }

  connectionRequestModel.cancel(requestId);
  return res.status(200).json({ message: "Request cancelled." });
}

// =========================================================
// DOCTOR-FACING: view incoming requests, accept/decline
// =========================================================

// GET /api/doctors/me/connection-requests
function listIncomingRequests(req, res) {
  const requests = connectionRequestModel.listPendingForDoctor(req.user.id);
  return res.status(200).json({ requests: requests.map(connectionRequestModel.toDoctorView) });
}

// POST /api/doctors/me/connection-requests/:requestId/accept
function acceptRequest(req, res) {
  const doctorId = req.user.id;
  const requestId = Number(req.params.requestId);

  const request = connectionRequestModel.findById(requestId);
  if (!request || request.doctor_id !== doctorId) {
    throw new HttpError(404, "Request not found.");
  }
  if (request.status !== "pending") {
    throw new HttpError(400, "This request has already been responded to.");
  }

  connectionRequestModel.accept(requestId);
  return res.status(200).json({ message: "Request accepted. Patient added to your patient list." });
}

// POST /api/doctors/me/connection-requests/:requestId/decline
function declineRequest(req, res) {
  const doctorId = req.user.id;
  const requestId = Number(req.params.requestId);

  const request = connectionRequestModel.findById(requestId);
  if (!request || request.doctor_id !== doctorId) {
    throw new HttpError(404, "Request not found.");
  }
  if (request.status !== "pending") {
    throw new HttpError(400, "This request has already been responded to.");
  }

  connectionRequestModel.decline(requestId);
  return res.status(200).json({ message: "Request declined." });
}

module.exports = {
  listAvailableDoctors,
  listMyDoctors,
  listOwnRequests,
  sendRequest,
  cancelRequest,
  listIncomingRequests,
  acceptRequest,
  declineRequest,
};
