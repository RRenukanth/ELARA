// Q-table adapter for the Q-Learning model.
//
// Q-Learning has no neural network -- its trained artifact is a lookup
// table (dict mapping a discretized state to per-action values), originally
// pickled as model.pkl in the notebook (Python-only format). To give the
// backend a loading path that doesn't require a Python process, the
// notebook also exports `model.json` (see the "Export to JSON" cell added
// alongside the existing "Export Best-Performing Fold Model" cell) -- a
// plain JSON object Node can load with no special library.
//
// Discretization must exactly match discretize_state() in Q_Learning.ipynb:
// each feature is clipped to [0, 1], multiplied by numBins, floored, and
// capped at numBins - 1. The trained state here is the SAME 15-dimension
// vector produced by preprocessingService.toTrainedRepresentation() --
// but note several of those 15 values (e.g. RobustScaler output) are NOT
// naturally bounded to [0, 1], so discretize_state()'s clip(0, 1) will
// saturate at the boundary bins for many values. This mirrors the training
// notebook's behavior exactly (see models/README.md for the caveat that the
// RL state's actual value ranges should be validated before deployment).

const fs = require("fs");

/**
 * Normalize a JSON-array-shaped state key string to a canonical form, so
 * lookups are insensitive to formatting differences between how the key
 * was originally serialized (e.g. Python's `json.dumps(list(...))` adds a
 * space after each comma -- "[2, 0, 2]" -- while JS's `JSON.stringify`
 * does not -- "[2,0,2]"). Parsing and re-stringifying with JSON.stringify
 * guarantees both sides of a lookup use the identical format.
 */
function canonicalizeKey(key) {
  return JSON.stringify(JSON.parse(key));
}

/**
 * Load a JSON-exported Q-table artifact from disk. Keys are re-canonicalized
 * on load (see canonicalizeKey) so lookups work regardless of whether the
 * file was produced by Python's json.dumps or another serializer.
 * @param {string} jsonPath
 * @returns {{ qTable: Record<string, number[]>, actionSize: number, numBins: number }}
 */
function loadQTable(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const qTable = {};
  for (const [key, value] of Object.entries(raw.q_table)) {
    qTable[canonicalizeKey(key)] = value;
  }
  return {
    qTable,
    actionSize: raw.action_size,
    numBins: raw.num_bins,
  };
}

/**
 * Discretize a continuous feature vector into the same bucketed string key
 * used as the Q-table's dict keys during training (see discretize_state()
 * in Q_Learning.ipynb -- this must stay in sync with that function).
 *
 * @param {number[]} featureVector
 * @param {number} numBins
 * @returns {string} a key matching the notebook's tuple-based state key,
 *   serialized the same way the JSON exporter serialized Python tuples.
 */
function discretizeState(featureVector, numBins) {
  const bins = featureVector.map((value) => {
    const clipped = Math.min(Math.max(value, 0), 1);
    const binned = Math.min(Math.floor(clipped * numBins), numBins - 1);
    return binned;
  });
  return JSON.stringify(bins);
}

/**
 * Look up the Q-values for a feature vector's discretized state.
 *
 * @param {{ qTable: Record<string, number[]>, actionSize: number, numBins: number }} model
 * @param {number[]} featureVector
 * @returns {{ predictedAction: number, confidenceScore: number, isUnknownState: boolean }}
 */
function predict(model, featureVector) {
  const key = discretizeState(featureVector, model.numBins);
  const qValues = model.qTable[key];

  if (!qValues) {
    // Unknown state during training too (see evaluate_agent() in
    // Q_Learning.ipynb) -- the notebook falls back to [0.5, 0.5], i.e. no
    // information; mirror that here rather than guessing.
    return { predictedAction: 0, confidenceScore: 0.5, isUnknownState: true };
  }

  const maxVal = Math.max(...qValues);
  const expValues = qValues.map((v) => Math.exp(v - maxVal));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  const probabilities = expValues.map((v) => v / sumExp);

  const predictedAction = probabilities.indexOf(Math.max(...probabilities));
  const confidenceScore = probabilities[1] ?? probabilities[predictedAction];

  return { predictedAction, confidenceScore, isUnknownState: false };
}

module.exports = { loadQTable, discretizeState, predict };
