// Preprocessing service: converts the 10 raw canonical features (as entered
// by a patient, or ingested from IoT) into the 15-dimension representation
// the RL models in research/reinforcement_learning/ were actually trained
// on -- i.e. it performs the SAME transformation that produced
// research/data/preprocessed_dataset_*.csv from research/data/heart_disease_uci.csv.
//
// This is the piece referenced by the "Known gap" section in
// models/README.md: without it, raw patient input cannot be fed to a model
// trained on the one-hot-encoded, RobustScaler-scaled 15-dim state.
//
// The scaler parameters (median/IQR) are NOT hardcoded here -- they are
// read from the `preprocessing_scaler_params` table, which is seeded from
// models/rl/preprocessing_params.json by
// backend/database/seedTrainingReferenceData.js. This keeps a single
// source of truth: if the reference dataset is ever legitimately re-fit
// (e.g. after deliberately incorporating patient-contributed training
// data -- see migrations/002_training_reference_data.sql), re-running the
// seeder updates this service automatically without a code change.
//
// Verified against research/data/preprocessed_dataset_2026-07-04_07-18-06.csv
// to floating-point precision (see research/preprocessing/fit_preprocessing_params.py).

const { get } = require("../database/db");

const CONTINUOUS_FEATURES = ["age", "trestbps", "thalach", "oldpeak"];

// Fixed one-hot column order the RL models were trained on. Do not reorder
// -- see models/rl/preprocessing_params.json ("trained_feature_order_15dim").
const TRAINED_FEATURE_ORDER_15DIM = [
  "sex", "fbs", "exang", "age", "trestbps", "thalach", "oldpeak",
  "cp_asymptomatic", "cp_atypical angina", "cp_non-anginal", "cp_typical angina",
  "restecg_lv hypertrophy", "restecg_normal", "restecg_st-t abnormality",
  "slope",
];

// Canonical integer code (as stored in health_data / used by the frontend
// form) -> the one-hot column it activates.
const CP_INT_TO_ONEHOT = {
  0: "cp_typical angina",
  1: "cp_atypical angina",
  2: "cp_non-anginal",
  3: "cp_asymptomatic",
};
const RESTECG_INT_TO_ONEHOT = {
  0: "restecg_normal",
  1: "restecg_st-t abnormality",
  2: "restecg_lv hypertrophy",
};

let cachedScalerParams = null;

/**
 * Load RobustScaler parameters (median, IQR) for the four continuous
 * features from the database. Cached after first read within this process
 * -- restart the backend (or extend this function) if the scaler is ever
 * deliberately re-fit and re-seeded.
 */
function getScalerParams() {
  if (cachedScalerParams) return cachedScalerParams;

  const params = {};
  for (const feature of CONTINUOUS_FEATURES) {
    const row = get(
      "SELECT median, iqr FROM preprocessing_scaler_params WHERE feature_name = ?",
      [feature]
    );
    if (!row) {
      throw new Error(
        `No scaler parameters found for '${feature}'. Run ` +
          "backend/database/seedTrainingReferenceData.js after generating " +
          "research/data/heart_disease_trimmed.csv and models/rl/preprocessing_params.json."
      );
    }
    if (row.iqr === 0) {
      throw new Error(`Scaler IQR for '${feature}' is zero -- cannot scale (division by zero).`);
    }
    params[feature] = { median: row.median, iqr: row.iqr };
  }

  cachedScalerParams = params;
  return params;
}

/** Clear the in-process cache (used by tests, or after re-seeding). */
function clearScalerParamsCache() {
  cachedScalerParams = null;
}

/**
 * Transform the 10 raw canonical features into the 15-dimension vector the
 * RL models were trained on.
 *
 * @param {Record<string, number>} features - the 10 canonical features,
 *   using the same integer encodings as health_data (cp: 0-3, restecg: 0-2,
 *   sex/fbs/exang: 0|1, slope: 0-2).
 * @returns {number[]} ordered 15-dimension feature vector
 */
function toTrainedRepresentation(features) {
  const scaler = getScalerParams();

  const vector = {
    sex: features.sex,
    fbs: features.fbs,
    exang: features.exang,
    age: (features.age - scaler.age.median) / scaler.age.iqr,
    trestbps: (features.trestbps - scaler.trestbps.median) / scaler.trestbps.iqr,
    thalach: (features.thalach - scaler.thalach.median) / scaler.thalach.iqr,
    oldpeak: (features.oldpeak - scaler.oldpeak.median) / scaler.oldpeak.iqr,
    "cp_asymptomatic": 0,
    "cp_atypical angina": 0,
    "cp_non-anginal": 0,
    "cp_typical angina": 0,
    "restecg_lv hypertrophy": 0,
    "restecg_normal": 0,
    "restecg_st-t abnormality": 0,
    slope: features.slope,
  };

  const cpColumn = CP_INT_TO_ONEHOT[features.cp];
  if (cpColumn === undefined) {
    throw new Error(`Unrecognized cp value: ${features.cp}`);
  }
  vector[cpColumn] = 1;

  const restecgColumn = RESTECG_INT_TO_ONEHOT[features.restecg];
  if (restecgColumn === undefined) {
    throw new Error(`Unrecognized restecg value: ${features.restecg}`);
  }
  vector[restecgColumn] = 1;

  return TRAINED_FEATURE_ORDER_15DIM.map((key) => vector[key]);
}

module.exports = {
  toTrainedRepresentation,
  getScalerParams,
  clearScalerParamsCache,
  TRAINED_FEATURE_ORDER_15DIM,
};
