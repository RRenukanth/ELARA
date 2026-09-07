// Model runtime service.
//
// The application must consume exported research artifacts, not silently
// retrain or fabricate a model (see product.md, data-contract.md, and
// models/README.md).
//
// DQN, PPO, and Q-Learning are trained with different frameworks and export
// different file formats (DQN/PPO: PyTorch .pth; Q-Learning: a pickled
// Q-table .pkl). Node.js cannot load either format natively. To give this
// service ONE common loading path regardless of algorithm, each notebook
// additionally exports a Node-loadable copy alongside its native format:
//   - DQN/PPO  -> model.onnx  (loaded via services/adapters/onnxAdapter.js)
//   - Q-Learning -> model.json (loaded via services/adapters/qtableAdapter.js)
// metadata.json's "runtime_compatibility.export_format" field says which
// one to use for a given model_version folder (see models/README.md).
//
// This service can hold MULTIPLE trained models at once (one per algorithm)
// so the patient/frontend can choose which RL algorithm to use for a given
// prediction (all three RL models use identical input representation for
// fair comparison). If no
// model with a Node-loadable export is found at all, this service runs in
// DEMO MODE: a transparent heuristic instead of a trained model, with every
// prediction response flagged demoMode: true.

const fs = require("fs");
const path = require("path");
const { CANONICAL_FEATURE_ORDER } = require("../utils/featureContract");
const { toTrainedRepresentation } = require("./preprocessingService");
const onnxAdapter = require("./adapters/onnxAdapter");
const qtableAdapter = require("./adapters/qtableAdapter");

const MODELS_RL_DIR = path.resolve(__dirname, "..", "..", "models", "rl");

// Display metadata for the algorithm-selection UI. Keyed by the canonical
// algorithm identifier used everywhere else in this file (metadata.json's
// "algorithm" field, normalized to lowercase-with-dash).
const ALGORITHM_DISPLAY = {
  ppo: { label: "PPO", description: "Proximal Policy Optimization -- typically the strongest performer of the three." },
  dqn: { label: "DQN", description: "Deep Q-Network." },
  "q-learning": { label: "Q-Learning", description: "Classical tabular Q-Learning." },
};

function normalizeAlgorithmKey(algorithm) {
  return String(algorithm || "").toLowerCase().trim();
}

/**
 * Scan models/rl/ once and return every version folder that has BOTH a
 * valid metadata.json and a Node-loadable export file matching the format
 * metadata.json declares. Does not load any runtime yet (that happens
 * lazily per-model on first use).
 */
function discoverModels() {
  if (!fs.existsSync(MODELS_RL_DIR)) return [];

  const entries = fs.readdirSync(MODELS_RL_DIR, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const versionDir = path.join(MODELS_RL_DIR, entry.name);
    const metadataPath = path.join(versionDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) continue;

    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch {
      continue; // malformed metadata.json - skip
    }

    const exportFormat = metadata.runtime_compatibility?.export_format;
    const exportFileName = exportFormat === "onnx" ? "model.onnx"
      : exportFormat === "json" ? "model.json"
      : null;
    if (!exportFileName) continue;

    const exportPath = path.join(versionDir, exportFileName);
    if (!fs.existsSync(exportPath)) continue;

    found.push({ versionDir, metadata, exportFormat, exportPath, folderName: entry.name });
  }

  return found;
}

// Discovered once at process start. Keyed by normalized algorithm name
// ("ppo", "dqn", "q-learning"). If multiple versions of the same algorithm
// exist on disk, the first one found wins -- keep exactly one version per
// algorithm under models/rl/ at a time, or extend this to pick by an
// explicit "active" marker if that's ever needed.
const discovered = discoverModels();
const modelsByAlgorithm = new Map();
for (const entry of discovered) {
  const key = normalizeAlgorithmKey(entry.metadata.algorithm);
  if (!modelsByAlgorithm.has(key)) {
    modelsByAlgorithm.set(key, entry);
  }
}

const DEMO_MODE = modelsByAlgorithm.size === 0;
const DEFAULT_ALGORITHM = modelsByAlgorithm.has("ppo")
  ? "ppo"
  : modelsByAlgorithm.keys().next().value;

// Loaded runtimes are cached lazily per algorithm (ONNX session creation is
// async; the Q-table is just a JSON read, but both go through the same
// lazy-init map for consistency).
const loadedRuntimes = new Map();
const loadingPromises = new Map();

async function ensureRuntimeLoaded(algorithmKey) {
  if (loadedRuntimes.has(algorithmKey)) return loadedRuntimes.get(algorithmKey);
  if (loadingPromises.has(algorithmKey)) return loadingPromises.get(algorithmKey);

  const entry = modelsByAlgorithm.get(algorithmKey);
  if (!entry) {
    throw new Error(`No model available for algorithm '${algorithmKey}'.`);
  }

  const promise = (async () => {
    let runtime;
    if (entry.exportFormat === "onnx") {
      const session = await onnxAdapter.loadSession(entry.exportPath);
      const inputName = entry.metadata.runtime_compatibility.input_name || session.inputNames[0];
      runtime = { type: "onnx", session, inputName };
    } else if (entry.exportFormat === "json") {
      const model = qtableAdapter.loadQTable(entry.exportPath);
      runtime = { type: "qtable", model };
    } else {
      throw new Error(`Unsupported export_format: ${entry.exportFormat}`);
    }
    loadedRuntimes.set(algorithmKey, runtime);
    return runtime;
  })();

  loadingPromises.set(algorithmKey, promise);
  return promise;
}

/**
 * List every algorithm currently available for prediction, for the
 * frontend's model-selection UI. Always includes an entry describing the
 * demo heuristic if no trained models are available at all.
 *
 * @returns {{key: string, label: string, description: string, modelVersion: string, isDefault: boolean, evaluationMetadata: object}[]}
 */
function listAvailableModels() {
  if (DEMO_MODE) {
    return [
      {
        key: "demo",
        label: "Demo Heuristic",
        description: "No trained model is currently loaded. Predictions use a transparent placeholder rule, not a trained RL model.",
        modelVersion: "demo-heuristic-v0",
        isDefault: true,
        evaluationMetadata: null,
      },
    ];
  }

  return Array.from(modelsByAlgorithm.entries()).map(([key, entry]) => ({
    key,
    label: ALGORITHM_DISPLAY[key]?.label || entry.metadata.algorithm,
    description: ALGORITHM_DISPLAY[key]?.description || "",
    modelVersion: entry.metadata.model_version,
    isDefault: key === DEFAULT_ALGORITHM,
    evaluationMetadata: entry.metadata.evaluation_metadata || null,
  }));
}

/**
 * Run inference for the ten canonical features (already validated & ordered
 * upstream by utils/featureContract.js) using a specific trained model's
 * confidence score, WITHOUT the risk-level/rounding wrapping applied by
 * predict() below. This is the function LIME uses to repeatedly query the
 * model against perturbed inputs (see limeExplainerService.js) -- it must
 * stay side-effect-free and cheap to call many times.
 *
 * @param {Record<string, number>} features
 * @param {string} [algorithmKey] - defaults to the active/default algorithm
 * @returns {Promise<number>} confidence score in [0, 1] (probability of "disease" class)
 */
async function scoreFeatures(features, algorithmKey) {
  if (DEMO_MODE) {
    return demoHeuristicScore(features);
  }

  const key = algorithmKey ? normalizeAlgorithmKey(algorithmKey) : DEFAULT_ALGORITHM;
  const entry = modelsByAlgorithm.get(key);
  if (!entry) {
    throw new Error(`No model available for algorithm '${key}'.`);
  }

  const runtime = await ensureRuntimeLoaded(key);
  const featureVector = toTrainedRepresentation(features);

  if (runtime.type === "onnx") {
    const output = await onnxAdapter.runInference(runtime.session, featureVector, runtime.inputName);
    const numClasses = entry.metadata.runtime_compatibility.num_classes || 2;
    const { confidenceScore } = onnxAdapter.interpretOutput(output, numClasses);
    return confidenceScore;
  }

  const { confidenceScore } = qtableAdapter.predict(runtime.model, featureVector);
  return confidenceScore;
}

/**
 * Deterministic, transparent placeholder heuristic (NOT a trained model).
 * Combines a few clinically-relevant canonical features into a bounded
 * pseudo-risk score purely so the rest of the application (UI, history,
 * LIME wiring) can be built and tested end-to-end before a real model
 * artifact is available. Exported separately from predict() so
 * scoreFeatures() (used by LIME) can call it too.
 *
 * @param {Record<string, number>} features
 * @returns {number} confidence score in [0, 1]
 */
function demoHeuristicScore(features) {
  const ordered = CANONICAL_FEATURE_ORDER.map((k) => Number(features[k]) || 0);
  const [thalach, restecg, oldpeak, slope, age, sex, cp, exang, trestbps, fbs] = ordered;

  let score = 0;
  score += cp >= 2 ? 0.2 : 0;
  score += exang === 1 ? 0.15 : 0;
  score += oldpeak > 1.5 ? 0.15 : oldpeak > 0.5 ? 0.05 : 0;
  score += slope === 0 ? 0.1 : 0;
  score += thalach < 120 ? 0.15 : 0;
  score += trestbps > 140 ? 0.1 : 0;
  score += fbs === 1 ? 0.05 : 0;
  score += restecg >= 1 ? 0.05 : 0;
  score += age > 55 ? 0.1 : 0;
  score += sex === 1 ? 0.05 : 0;

  return Math.min(0.99, Math.max(0.01, score));
}

function riskLevelFor(confidenceScore) {
  return confidenceScore >= 0.6 ? "HIGH RISK" : confidenceScore >= 0.3 ? "MEDIUM RISK" : "LOW RISK";
}

/**
 * Run a full prediction for the ten canonical features.
 *
 * @param {Record<string, number>} features
 * @param {{algorithm?: string}} [options] - optional algorithm selection
 *   (e.g. "ppo", "dqn", "q-learning"); defaults to the app's default model.
 * @returns {Promise<{riskLevel: string, confidenceScore: number, demoMode: boolean, modelVersion: string, algorithm: string}>}
 */
async function predict(features, options = {}) {
  if (DEMO_MODE) {
    const confidenceScore = demoHeuristicScore(features);
    return {
      riskLevel: riskLevelFor(confidenceScore),
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      demoMode: true,
      modelVersion: "demo-heuristic-v0",
      algorithm: "demo",
    };
  }

  const key = options.algorithm ? normalizeAlgorithmKey(options.algorithm) : DEFAULT_ALGORITHM;
  if (!modelsByAlgorithm.has(key)) {
    throw new Error(
      `Unknown or unavailable algorithm '${options.algorithm}'. ` +
        `Available: ${Array.from(modelsByAlgorithm.keys()).join(", ")}.`
    );
  }

  const confidenceScore = await scoreFeatures(features, key);
  const entry = modelsByAlgorithm.get(key);

  return {
    riskLevel: riskLevelFor(confidenceScore),
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    demoMode: false,
    modelVersion: entry.metadata.model_version,
    algorithm: key,
  };
}

module.exports = {
  predict,
  scoreFeatures,
  listAvailableModels,
  isDemoMode: () => DEMO_MODE,
  defaultAlgorithm: DEFAULT_ALGORITHM,
  activeModelMetadata: DEMO_MODE ? null : modelsByAlgorithm.get(DEFAULT_ALGORITHM).metadata,
};
