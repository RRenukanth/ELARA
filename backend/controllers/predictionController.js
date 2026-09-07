const healthDataModel = require("../models/healthDataModel");
const predictionModel = require("../models/predictionModel");
const doctorModel = require("../models/doctorModel");
const modelService = require("../services/modelService");
const limeService = require("../services/limeService");
const { extractCanonicalFeatures } = require("../utils/featureContract");
const { HttpError } = require("../middleware/errorHandler");

// =========================================================
// CREATE PREDICTION (patient submits the 10 canonical features)
// Patient identity comes from req.user (JWT), never from the request body.
// =========================================================
async function createPrediction(req, res) {
  const patientId = req.user.id;

  const { valid, errors, features } = extractCanonicalFeatures(req.body);
  if (!valid) {
    throw new HttpError(400, errors.join(" "));
  }

  const healthRecord = healthDataModel.create(patientId, features, req.body.source === "iot" ? "iot" : "manual");

  // Algorithm selection is intentionally not exposed to the client: the
  // app only uses PPO for predictions (see product decision to disable
  // model selection). Any client-supplied "algorithm" field is ignored so
  // this cannot be bypassed via a direct API call. DQN and Q-Learning
  // artifacts remain on disk under models/rl/ and are still fully usable
  // via modelService.predict(features, { algorithm }) if re-enabled later.
  const result = await modelService.predict(features, { algorithm: "ppo" });

  // LIME must query the EXACT SAME model/algorithm that produced this
  // prediction (see explainability.md) -- bind scoreFeatures to it.
  const scoreFn = (sampleFeatures) => modelService.scoreFeatures(sampleFeatures, result.algorithm);
  const explanation = await limeService.explain(features, scoreFn, result.demoMode);

  const prediction = predictionModel.create({
    patientId,
    healthId: healthRecord.health_id,
    modelVersion: result.modelVersion,
    algorithm: result.algorithm,
    demoMode: result.demoMode,
    riskLevel: result.riskLevel,
    confidenceScore: result.confidenceScore,
    contributingFactors: explanation.factors,
    patientExplanation: limeService.toPatientExplanation(explanation),
    doctorExplanation: limeService.toDoctorExplanation(explanation),
  });

  return res.status(201).json({
    message: "Prediction generated.",
    disclaimer:
      "This is a model-based risk assessment, not a medical diagnosis. Consult a qualified healthcare professional for medical decisions.",
    prediction: predictionModel.toPatientView(prediction),
  });
}

// =========================================================
// PREDICTION HISTORY (patient's own records only)
// =========================================================
function getHistory(req, res) {
  const patientId = req.user.id;
  const rows = predictionModel.listForPatient(patientId);
  return res.status(200).json({ predictions: rows.map(predictionModel.toPatientView) });
}

// =========================================================
// LATEST PREDICTION (patient's own record only)
// =========================================================
function getLatest(req, res) {
  const patientId = req.user.id;
  const row = predictionModel.latestForPatient(patientId);
  if (!row) {
    return res.status(404).json({ message: "No predictions found yet." });
  }
  return res.status(200).json({ prediction: predictionModel.toPatientView(row) });
}

// =========================================================
// DOCTOR VIEW OF A PATIENT'S PREDICTION HISTORY
// Only allowed if the patient is assigned to this doctor.
// =========================================================
function getPatientHistoryForDoctor(req, res) {
  const doctorId = req.user.id;
  const patientId = Number(req.params.patientId);

  if (!doctorModel.isPatientAssignedToDoctor(doctorId, patientId)) {
    throw new HttpError(403, "This patient is not assigned to you.");
  }

  const rows = predictionModel.listForPatient(patientId);
  return res.status(200).json({ predictions: rows.map(predictionModel.toDoctorView) });
}

module.exports = {
  createPrediction,
  getHistory,
  getLatest,
  getPatientHistoryForDoctor,
};
