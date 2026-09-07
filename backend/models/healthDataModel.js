const { get, all, run } = require("../database/db");
const { CANONICAL_FEATURE_ORDER } = require("../utils/featureContract");

/**
 * Insert a health_data row from a validated, canonical-order features object.
 * @param {number} patientId
 * @param {Record<string, number>} features - keys are the 10 canonical names
 * @param {'manual'|'iot'} source
 */
function create(patientId, features, source = "manual") {
  const result = run(
    `INSERT INTO health_data (
      patient_id, thalach, restecg, oldpeak, slope, age, sex, cp, exang, trestbps, fbs, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patientId,
      features.thalach,
      features.restecg,
      features.oldpeak,
      features.slope,
      features.age,
      features.sex,
      features.cp,
      features.exang,
      features.trestbps,
      features.fbs,
      source,
    ]
  );
  return findById(Number(result.lastInsertRowid));
}

function findById(healthId) {
  return get("SELECT * FROM health_data WHERE health_id = ?", [healthId]);
}

function findByIdForPatient(healthId, patientId) {
  return get("SELECT * FROM health_data WHERE health_id = ? AND patient_id = ?", [
    healthId,
    patientId,
  ]);
}

function listForPatient(patientId, limit = 50) {
  return all(
    "SELECT * FROM health_data WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT ?",
    [patientId, limit]
  );
}

/** Extract just the 10 canonical features (in order) from a DB row. */
function toFeatureArray(row) {
  return CANONICAL_FEATURE_ORDER.map((key) => row[key]);
}

module.exports = { create, findById, findByIdForPatient, listForPatient, toFeatureArray };
