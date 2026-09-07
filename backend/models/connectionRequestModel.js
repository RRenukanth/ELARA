// Patient <-> Doctor connection request model.
//
// Implements the request/accept workflow: a patient sends a request to a
// specific (admin-approved) doctor; the doctor accepts or declines. On
// accept, a doctor_patient_assignments row is created atomically with the
// request's status update, so the two tables never drift out of sync.
//
// This is the PRIMARY way assignments get created day-to-day. The admin's
// direct-assign endpoint (adminController.assignPatientToDoctor) remains as
// a manual override and writes into doctor_patient_assignments directly,
// bypassing this table entirely -- which is fine, since access control only
// ever checks doctor_patient_assignments, never this table.

const { get, all, run, transaction } = require("../database/db");

function findPendingRequest(patientId, doctorId) {
  return get(
    "SELECT * FROM doctor_patient_requests WHERE patient_id = ? AND doctor_id = ? AND status = 'pending'",
    [patientId, doctorId]
  );
}

function findById(requestId) {
  return get("SELECT * FROM doctor_patient_requests WHERE request_id = ?", [requestId]);
}

/**
 * Create a new pending request. Caller must have already verified there is
 * no existing pending request for this (patient, doctor) pair and that the
 * two are not already assigned -- see connectionRequestController.js.
 */
function create(patientId, doctorId) {
  const result = run(
    "INSERT INTO doctor_patient_requests (patient_id, doctor_id) VALUES (?, ?)",
    [patientId, doctorId]
  );
  return findById(Number(result.lastInsertRowid));
}

/** All requests a patient has sent, most recent first. */
function listForPatient(patientId) {
  return all(
    `SELECT r.*, d.first_name AS doctor_first_name, d.last_name AS doctor_last_name,
            d.hospital_name AS doctor_hospital_name, d.specialization AS doctor_specialization
     FROM doctor_patient_requests r
     JOIN doctors d ON d.doctor_id = r.doctor_id
     WHERE r.patient_id = ?
     ORDER BY r.requested_at DESC`,
    [patientId]
  );
}

/** Pending requests a doctor has received, oldest first (FIFO review queue). */
function listPendingForDoctor(doctorId) {
  return all(
    `SELECT r.*, p.first_name AS patient_first_name, p.last_name AS patient_last_name,
            p.age AS patient_age, p.sex AS patient_sex
     FROM doctor_patient_requests r
     JOIN patients p ON p.patient_id = r.patient_id
     WHERE r.doctor_id = ? AND r.status = 'pending'
     ORDER BY r.requested_at ASC`,
    [doctorId]
  );
}

/**
 * Doctor accepts a request: creates the assignment and marks the request
 * accepted in a single transaction, so a crash between the two steps can
 * never leave an accepted request with no matching assignment (or vice versa).
 */
function accept(requestId) {
  return transaction(() => {
    const request = get("SELECT * FROM doctor_patient_requests WHERE request_id = ?", [requestId]);
    if (!request) return null;

    run(
      "INSERT OR IGNORE INTO doctor_patient_assignments (doctor_id, patient_id) VALUES (?, ?)",
      [request.doctor_id, request.patient_id]
    );
    run(
      "UPDATE doctor_patient_requests SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE request_id = ?",
      [requestId]
    );

    return findById(requestId);
  });
}

function decline(requestId) {
  run(
    "UPDATE doctor_patient_requests SET status = 'declined', responded_at = CURRENT_TIMESTAMP WHERE request_id = ?",
    [requestId]
  );
  return findById(requestId);
}

function cancel(requestId) {
  run(
    "UPDATE doctor_patient_requests SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP WHERE request_id = ?",
    [requestId]
  );
  return findById(requestId);
}

function toPatientView(row) {
  return {
    requestId: row.request_id,
    status: row.status,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at,
    doctor: {
      doctorId: row.doctor_id,
      firstName: row.doctor_first_name,
      lastName: row.doctor_last_name,
      hospitalName: row.doctor_hospital_name,
      specialization: row.doctor_specialization,
    },
  };
}

function toDoctorView(row) {
  return {
    requestId: row.request_id,
    status: row.status,
    requestedAt: row.requested_at,
    patient: {
      patientId: row.patient_id,
      firstName: row.patient_first_name,
      lastName: row.patient_last_name,
      age: row.patient_age,
      sex: row.patient_sex,
    },
  };
}

module.exports = {
  findPendingRequest,
  findById,
  create,
  listForPatient,
  listPendingForDoctor,
  accept,
  decline,
  cancel,
  toPatientView,
  toDoctorView,
};
