// Canonical model data contract.
// The ten model inputs MUST always appear in this exact order everywhere
// they are serialized for the model (prediction requests, LIME
// explanations, IoT payload mapping).
//
// Do not reorder, rename, or silently add/remove entries here. If the
// research pipeline's feature set ever changes, that is a deliberate,
// reviewed change to this file plus every consumer of it.

const CANONICAL_FEATURE_ORDER = [
  "thalach",
  "restecg",
  "oldpeak",
  "slope",
  "age",
  "sex",
  "cp",
  "exang",
  "trestbps",
  "fbs",
];

// Patient-facing labels (may be refined for usability; internal names are stable).
const FEATURE_LABELS = {
  thalach: "Maximum heart rate",
  restecg: "Resting ECG result",
  oldpeak: "ECG stress-test change",
  slope: "ECG ST-segment slope",
  age: "Age",
  sex: "Sex",
  cp: "Chest pain type",
  exang: "Exercise-related chest discomfort",
  trestbps: "Resting blood pressure",
  fbs: "Fasting blood sugar indicator",
};

// Validation ranges based on the UCI Cleveland heart disease dataset conventions
// used by the research pipeline (research/preprocessing, research/reinforcement_learning).
const FEATURE_VALIDATION = {
  thalach: { type: "number", min: 60, max: 250 },
  restecg: { type: "enum", values: [0, 1, 2] },
  oldpeak: { type: "number", min: 0, max: 10 },
  slope: { type: "enum", values: [0, 1, 2] },
  age: { type: "number", min: 1, max: 120 },
  sex: { type: "enum", values: [0, 1] }, // 0 = female, 1 = male (UCI convention)
  cp: { type: "enum", values: [0, 1, 2, 3] },
  exang: { type: "enum", values: [0, 1] },
  trestbps: { type: "number", min: 50, max: 250 },
  fbs: { type: "enum", values: [0, 1] },
};

/**
 * Extract and validate the ten canonical features from an arbitrary object.
 * Returns { valid, errors, features } where `features` preserves canonical order.
 */
function extractCanonicalFeatures(input) {
  const errors = [];
  const features = {};

  for (const key of CANONICAL_FEATURE_ORDER) {
    const rule = FEATURE_VALIDATION[key];
    const value = input[key];

    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required feature: ${key}`);
      continue;
    }

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      errors.push(`Feature ${key} must be numeric.`);
      continue;
    }

    if (rule.type === "enum" && !rule.values.includes(numericValue)) {
      errors.push(`Feature ${key} must be one of: ${rule.values.join(", ")}.`);
      continue;
    }

    if (rule.type === "number" && (numericValue < rule.min || numericValue > rule.max)) {
      errors.push(`Feature ${key} must be between ${rule.min} and ${rule.max}.`);
      continue;
    }

    features[key] = numericValue;
  }

  return { valid: errors.length === 0, errors, features };
}

/**
 * Produce an array of values in canonical order from a features object
 * (e.g. for feeding a model or a LIME explainer).
 */
function toOrderedArray(features) {
  return CANONICAL_FEATURE_ORDER.map((key) => features[key]);
}

module.exports = {
  CANONICAL_FEATURE_ORDER,
  FEATURE_LABELS,
  FEATURE_VALIDATION,
  extractCanonicalFeatures,
  toOrderedArray,
};
