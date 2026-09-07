// Real LIME (Local Interpretable Model-agnostic Explanations) implementation.
//
// LIME must operate against the exact same model and preprocessing as the
// deployed prediction, and explanations must not be generated using a
// separately trained prediction model. This module satisfies both
// requirements by calling
// modelService.scoreFeatures() directly (the SAME function predict() uses)
// for every perturbed sample -- there is no second, separately-fitted
// explanation model here beyond LIME's own local linear surrogate, which by
// definition only approximates the real model in a small neighborhood
// around one specific input.
//
// Algorithm (standard LIME for tabular data):
//   1. Generate N perturbed samples around the real input by adding Gaussian
//      noise scaled to each feature's typical range.
//   2. Query the real model (modelService.scoreFeatures) for every sample.
//   3. Weight each sample by proximity to the original input (closer
//      samples matter more) using an exponential kernel on normalized
//      distance.
//   4. Fit a weighted linear regression: predicted_score ~ features.
//      The fitted coefficients are the "contribution scores" -- how much
//      each feature's value pushed the local approximation toward or away
//      from the "disease" class, in this specific neighborhood.
//
// This is a from-scratch, dependency-free implementation (no numpy/sklearn
// equivalent in Node) rather than a port of a specific library, but follows
// the same design as the reference `lime` Python package's tabular explainer.

const { CANONICAL_FEATURE_ORDER, FEATURE_LABELS, FEATURE_VALIDATION } = require("../utils/featureContract");
const { createRng, nextGaussian } = require("../utils/prng");

const DEFAULT_NUM_SAMPLES = 200;

// Perturbation scale per feature (roughly the feature's usable range / 6,
// so +-3 standard deviations stays within a plausible clinical range).
// Falls back to a fraction of (max - min) from FEATURE_VALIDATION for
// numeric features; enum features perturb by nearest valid categories.
function perturbationScale(featureKey) {
  const rule = FEATURE_VALIDATION[featureKey];
  if (rule.type === "number") {
    return (rule.max - rule.min) / 6;
  }
  // enum: perturbation scale is unused directly (see generateSample), but
  // keep a value so downstream math never divides by zero.
  return 1;
}

/**
 * Generate one perturbed feature sample around the original input.
 * Numeric features get Gaussian noise (clamped to valid range). Enum
 * features are randomly reassigned to one of their valid values with some
 * probability, and left unchanged otherwise -- this explores the effect of
 * *changing* a categorical feature, which additive noise can't express.
 */
function generateSample(originalFeatures, rng) {
  const sample = {};
  for (const key of CANONICAL_FEATURE_ORDER) {
    const rule = FEATURE_VALIDATION[key];
    const original = originalFeatures[key];

    if (rule.type === "enum") {
      const changeProbability = 0.35;
      if (rng() < changeProbability) {
        const options = rule.values;
        sample[key] = options[Math.floor(rng() * options.length)];
      } else {
        sample[key] = original;
      }
    } else {
      const scale = perturbationScale(key);
      const noisy = original + nextGaussian(rng) * scale;
      sample[key] = Math.min(rule.max, Math.max(rule.min, noisy));
    }
  }
  return sample;
}

/** Normalize a features object to [0, 1] per feature, for distance/kernel math. */
function normalizeFeatures(features) {
  const normalized = {};
  for (const key of CANONICAL_FEATURE_ORDER) {
    const rule = FEATURE_VALIDATION[key];
    const min = rule.type === "enum" ? Math.min(...rule.values) : rule.min;
    const max = rule.type === "enum" ? Math.max(...rule.values) : rule.max;
    normalized[key] = max > min ? (features[key] - min) / (max - min) : 0;
  }
  return normalized;
}

function euclideanDistance(a, b) {
  let sumSquares = 0;
  for (const key of CANONICAL_FEATURE_ORDER) {
    const diff = a[key] - b[key];
    sumSquares += diff * diff;
  }
  return Math.sqrt(sumSquares);
}

/**
 * Fit a weighted linear regression via the normal equations, solved with
 * Gauss-Jordan elimination (small, fixed-size system -- 11x11 for 10
 * features + intercept -- so a dependency-free direct solve is fine).
 *
 * @param {number[][]} X - design matrix, each row = [1, f1, f2, ..., f10]
 * @param {number[]} y - target values (model confidence scores)
 * @param {number[]} weights - per-sample weight
 * @returns {number[]} coefficients [intercept, coef_f1, ..., coef_f10]
 */
function weightedLinearRegression(X, y, weights) {
  const numFeatures = X[0].length;
  const numSamples = X.length;

  // Build the weighted normal equations: (X^T W X) beta = X^T W y
  const XtWX = Array.from({ length: numFeatures }, () => new Array(numFeatures).fill(0));
  const XtWy = new Array(numFeatures).fill(0);

  for (let s = 0; s < numSamples; s++) {
    const w = weights[s];
    for (let i = 0; i < numFeatures; i++) {
      XtWy[i] += w * X[s][i] * y[s];
      for (let j = 0; j < numFeatures; j++) {
        XtWX[i][j] += w * X[s][i] * X[s][j];
      }
    }
  }

  // Ridge regularization (small lambda) for numerical stability -- without
  // it, near-collinear perturbed enum columns can make XtWX singular.
  const ridgeLambda = 1e-6;
  for (let i = 0; i < numFeatures; i++) {
    XtWX[i][i] += ridgeLambda;
  }

  return solveLinearSystem(XtWX, XtWy);
}

/** Solve Ax = b via Gauss-Jordan elimination with partial pivoting. */
function solveLinearSystem(A, b) {
  const n = A.length;
  const augmented = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivotRow][col])) {
        pivotRow = row;
      }
    }
    [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];

    const pivotValue = augmented[col][col];
    if (Math.abs(pivotValue) < 1e-12) continue; // singular-ish; leave as 0 contribution

    for (let j = col; j <= n; j++) {
      augmented[col][j] /= pivotValue;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = col; j <= n; j++) {
        augmented[row][j] -= factor * augmented[col][j];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

/**
 * Explain a single prediction by fitting a local linear surrogate around
 * the given features, querying the real model via scoreFn for every
 * perturbed sample.
 *
 * @param {Record<string, number>} features - the 10 canonical features
 *   that were actually submitted for the real prediction being explained.
 * @param {(features: Record<string, number>) => Promise<number>} scoreFn -
 *   MUST be the exact same scoring function used for the real prediction
 *   (see predictionController.js passing modelService.scoreFeatures bound
 *   to the algorithm that was actually used).
 * @param {{numSamples?: number, seed?: number}} [options]
 * @returns {Promise<{factor: string, label: string, contribution: number}[]>}
 *   contribution is the fitted linear coefficient for that feature --
 *   positive means increasing that feature's value pushed the local model
 *   toward higher risk, negative means it pushed toward lower risk. Sorted
 *   by absolute magnitude, largest first.
 */
async function explain(features, scoreFn, options = {}) {
  const numSamples = options.numSamples || DEFAULT_NUM_SAMPLES;
  const rng = createRng(options.seed);

  const samples = [features]; // always include the original point itself
  for (let i = 1; i < numSamples; i++) {
    samples.push(generateSample(features, rng));
  }

  const scores = await Promise.all(samples.map((s) => scoreFn(s)));

  const normalizedOriginal = normalizeFeatures(features);
  const kernelWidth = 0.75; // in normalized-distance units; matches typical LIME defaults scaled to [0,1] features

  const weights = samples.map((s) => {
    const distance = euclideanDistance(normalizeFeatures(s), normalizedOriginal);
    return Math.exp(-(distance * distance) / (2 * kernelWidth * kernelWidth));
  });

  // Design matrix uses NORMALIZED features so coefficients are comparable
  // across features with very different natural scales (e.g. age vs. oldpeak).
  const X = samples.map((s) => {
    const n = normalizeFeatures(s);
    return [1, ...CANONICAL_FEATURE_ORDER.map((key) => n[key])];
  });

  const coefficients = weightedLinearRegression(X, scores, weights);
  const [, ...featureCoefficients] = coefficients; // drop intercept

  const factors = CANONICAL_FEATURE_ORDER.map((key, idx) => ({
    factor: key,
    label: FEATURE_LABELS[key],
    contribution: Math.round(featureCoefficients[idx] * 10000) / 10000,
  }));

  factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return factors;
}

module.exports = { explain, generateSample, normalizeFeatures, DEFAULT_NUM_SAMPLES };
