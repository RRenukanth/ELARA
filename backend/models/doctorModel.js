const { get, all, run } = require("../database/db");

function findByUsername(username) {
  return get("SELECT * FROM doctors WHERE username = ?", [username]);
}

function findByEmail(email) {
  return get("SELECT * FROM doctors WHERE email = ?", [email]);
}

function findById(doctorId) {
  return get("SELECT * FROM doctors WHERE doctor_id = ?", [doctorId]);
}

function create(doctor) {
  const result = run(
    `INSERT INTO doctors (
      username, password_hash, first_name, last_name, email,
      age, sex, phone_number, hospital_name, hospital_address,
      specialization, registration_number, years_experience,
      license_document_path, nic_document_path, profile_picture_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      doctor.username,
      doctor.passwordHash,
      doctor.firstName,
      doctor.lastName,
      doctor.email,
      doctor.age || null,
      doctor.sex || null,
      doctor.phoneNumber || null,
      doctor.hospitalName || null,
      doctor.hospitalAddress || null,
      doctor.specialization || null,
      doctor.registrationNumber || null,
      doctor.yearsExperience || null,
      doctor.licenseDocumentPath || null,
      doctor.nicDocumentPath || null,
      doctor.profilePicturePath || null,
    ]
  );
  return findById(Number(result.lastInsertRowid));
}

function listPending() {
  return all("SELECT * FROM doctors WHERE approval_status = 'pending' ORDER BY created_at ASC");
}

function setApprovalStatus(doctorId, status) {
  run(
    "UPDATE doctors SET approval_status = ?, updated_at = CURRENT_TIMESTAMP WHERE doctor_id = ?",
    [status, doctorId]
  );
  return findById(doctorId);
}

function assignedPatientIds(doctorId) {
  const rows = all(
    "SELECT patient_id FROM doctor_patient_assignments WHERE doctor_id = ?",
    [doctorId]
  );
  return rows.map((r) => r.patient_id);
}

function isPatientAssignedToDoctor(doctorId, patientId) {
  const row = get(
    "SELECT 1 FROM doctor_patient_assignments WHERE doctor_id = ? AND patient_id = ?",
    [doctorId, patientId]
  );
  return Boolean(row);
}

function assignPatient(doctorId, patientId) {
  run(
    "INSERT OR IGNORE INTO doctor_patient_assignments (doctor_id, patient_id) VALUES (?, ?)",
    [doctorId, patientId]
  );
}

// Doctors a patient can browse and send a connection request to. Only
// admin-approved doctors are listed -- see security-and-privacy.md /
// product.md: doctors require administrator approval before patients can
// discover or connect with them.
function listApproved() {
  return all(
    "SELECT * FROM doctors WHERE approval_status = 'approved' ORDER BY last_name, first_name"
  );
}

// Doctors already assigned to a given patient (i.e. an accepted request or
// an admin direct-assignment already exists) -- used for the patient's "My
// Doctors" view and to avoid re-showing a "connect" option for a doctor
// they're already connected with.
function listAssignedDoctorsForPatient(patientId) {
  return all(
    `SELECT d.* FROM doctors d
     JOIN doctor_patient_assignments a ON a.doctor_id = d.doctor_id
     WHERE a.patient_id = ?
     ORDER BY d.last_name, d.first_name`,
    [patientId]
  );
}

function toPublicProfile(doctor) {
  return {
    doctorId: doctor.doctor_id,
    username: doctor.username,
    firstName: doctor.first_name,
    lastName: doctor.last_name,
    email: doctor.email,
    hospitalName: doctor.hospital_name,
    specialization: doctor.specialization,
    approvalStatus: doctor.approval_status,
    createdAt: doctor.created_at,
  };
}

// Minimal directory listing shown to PATIENTS browsing doctors to connect
// with -- deliberately excludes email/phone/registration number (patients
// don't need those to decide who to request; the doctor's identity is
// enough). Contrast with toPublicProfile(), used for admin/doctor-facing views.
function toPublicDirectoryProfile(doctor) {
  return {
    doctorId: doctor.doctor_id,
    firstName: doctor.first_name,
    lastName: doctor.last_name,
    hospitalName: doctor.hospital_name,
    specialization: doctor.specialization,
    yearsExperience: doctor.years_experience,
  };
}

module.exports = {
  findByUsername,
  findByEmail,
  findById,
  create,
  listPending,
  setApprovalStatus,
  assignedPatientIds,
  isPatientAssignedToDoctor,
  assignPatient,
  listApproved,
  listAssignedDoctorsForPatient,
  toPublicProfile,
  toPublicDirectoryProfile,
};
