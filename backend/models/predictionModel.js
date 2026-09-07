const { get, all, run } = require("../database/db");

function create(prediction) {
  const result = run(
    `INSERT INTO predictions (
      patient_id, health_id, model_version, algorithm, demo_mode, risk_level,
      confidence_score, contributing_factors, patient_explanation, doctor_explanation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      prediction.patientId,
      prediction.healthId,
      prediction.modelVersion,
      prediction.algorithm || "demo",
      prediction.demoMode ? 1 : 0,
      prediction.riskLevel,
      prediction.confidenceScore,
      JSON.stringify(prediction.contributingFactors || []),
      prediction.patientExplanation || null,
      prediction.doctorExplanation || null,
    ]
  );
  return findById(Number(result.lastInsertRowid));
}

function findById(predictionId) {
  return get("SELECT * FROM predictions WHERE prediction_id = ?", [predictionId]);
}

function findByIdForPatient(predictionId, patientId) {
  return get(
    "SELECT * FROM predictions WHERE prediction_id = ? AND patient_id = ?",
    [predictionId, patientId]
  );
}

function listForPatient(patientId, limit = 50) {
  return all(
    `SELECT p.*, h.thalach, h.restecg, h.oldpeak, h.slope, h.age, h.sex, h.cp, h.exang, h.trestbps, h.fbs
     FROM predictions p
     JOIN health_data h ON h.health_id = p.health_id
     WHERE p.patient_id = ?
     ORDER BY p.created_at DESC
     LIMIT ?`,
    [patientId, limit]
  );
}

function latestForPatient(patientId) {
  return get(
    `SELECT p.*, h.thalach, h.restecg, h.oldpeak, h.slope, h.age, h.sex, h.cp, h.exang, h.trestbps, h.fbs
     FROM predictions p
     JOIN health_data h ON h.health_id = p.health_id
     WHERE p.patient_id = ?
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [patientId]
  );
}

function toPatientView(row) {
  let factors = [];
  try {
    factors = JSON.parse(row.contributing_factors || "[]");
  } catch {
    factors = [];
  }
  return {
    predictionId: row.prediction_id,
    riskLevel: row.risk_level,
    confidenceScore: row.confidence_score,
    contributingFactors: factors,
    explanation: row.patient_explanation,
    demoMode: Boolean(row.demo_mode),
    modelVersion: row.model_version,
    algorithm: row.algorithm,
    createdAt: row.created_at,
  };
}

function toDoctorView(row) {
  return {
    ...toPatientView(row),
    doctorExplanation: row.doctor_explanation,
    features: {
      thalach: row.thalach,
      restecg: row.restecg,
      oldpeak: row.oldpeak,
      slope: row.slope,
      age: row.age,
      sex: row.sex,
      cp: row.cp,
      exang: row.exang,
      trestbps: row.trestbps,
      fbs: row.fbs,
    },
  };
}

module.exports = {
  create,
  findById,
  findByIdForPatient,
  listForPatient,
  latestForPatient,
  toPatientView,
  toDoctorView,
};
