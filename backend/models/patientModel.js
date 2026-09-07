const { db, get, all, run } = require("../database/db");

function findByUsername(username) {
  return get("SELECT * FROM patients WHERE username = ?", [username]);
}

function findByEmail(email) {
  return get("SELECT * FROM patients WHERE email = ?", [email]);
}

function findById(patientId) {
  return get("SELECT * FROM patients WHERE patient_id = ?", [patientId]);
}

function create(patient) {
  const result = run(
    `INSERT INTO patients (
      username, password_hash, first_name, last_name, email,
      age, sex, phone_number, emergency_contact
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.username,
      patient.passwordHash,
      patient.firstName,
      patient.lastName,
      patient.email,
      patient.age,
      patient.sex,
      patient.phoneNumber || null,
      patient.emergencyContact || null,
    ]
  );
  return findById(Number(result.lastInsertRowid));
}

// Returns a de-identified projection safe for model-analysis contexts
// (see security-and-privacy.md: no name/email/phone/address in model-analysis data).
function toPublicProfile(patient) {
  return {
    patientId: patient.patient_id,
    username: patient.username,
    firstName: patient.first_name,
    lastName: patient.last_name,
    email: patient.email,
    age: patient.age,
    sex: patient.sex,
    phoneNumber: patient.phone_number,
    status: patient.status,
    createdAt: patient.created_at,
  };
}

module.exports = { db, findByUsername, findByEmail, findById, create, toPublicProfile };
