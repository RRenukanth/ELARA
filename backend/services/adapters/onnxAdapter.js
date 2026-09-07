// ONNX adapter for the DQN and PPO models.
//
// Both DQN and PPO are trained in PyTorch (.pth checkpoints), which Node.js
// cannot load natively. To give the backend a single loading path for both
// algorithms, the research notebooks export an additional `model.onnx` file
// (see the "Export to ONNX" cell added alongside each notebook's existing
// "Export Best-Performing Fold Model" cell) -- ONNX is an open, framework-
// neutral format that `onnxruntime-node` can run directly, without needing
// Python or PyTorch installed on the server.
//
// This adapter only knows how to run a loaded ONNX session against a
// feature vector; it has no algorithm-specific logic. DQN and PPO differ in
// how their output should be interpreted (see interpretOutput below), which
// is controlled by metadata.json's "algorithm" field, not by this file.

const ort = require("onnxruntime-node");

/**
 * Load an ONNX model from disk into an inference session.
 * @param {string} onnxPath
 * @returns {Promise<ort.InferenceSession>}
 */
async function loadSession(onnxPath) {
  return ort.InferenceSession.create(onnxPath);
}

/**
 * Run inference for a single feature vector.
 *
 * @param {ort.InferenceSession} session
 * @param {number[]} featureVector - already preprocessed (e.g. via
 *   preprocessingService.toTrainedRepresentation()), in the exact order
 *   the model was trained on.
 * @param {string} inputName - the model's input tensor name (recorded in
 *   metadata.json at export time, since it varies by how the notebook
 *   defined the ONNX export).
 * @returns {Promise<Float32Array>} raw output tensor data (logits/Q-values)
 */
async function runInference(session, featureVector, inputName) {
  const inputTensor = new ort.Tensor(
    "float32",
    Float32Array.from(featureVector),
    [1, featureVector.length]
  );

  const feeds = { [inputName]: inputTensor };
  const results = await session.run(feeds);

  const outputName = session.outputNames[0];
  return results[outputName].data;
}

/**
 * Interpret a raw model output as a binary risk prediction.
 *
 * IMPORTANT: PPO and DQN do NOT have the same output shape in these
 * notebooks.
 *   - PPO: ACTION_SIZE = 2 -- a genuine binary classifier output
 *     (index 0 = "No Heart Disease", index 1 = "Heart Disease").
 *   - DQN: ACTION_SIZE = NUM_FEATURES * 3 (increase/decrease/hold per
 *     feature -- a feature-modification action space, not a classifier).
 *     The notebook's own evaluation cell repurposes this by taking only
 *     the FIRST TWO Q-values as a binary classifier
 *     (`torch.argmax(q_values[:, :2], dim=1)` in EHR_DQN_PyTorch.ipynb).
 *     To reproduce that exactly, this function only uses the first
 *     `numClasses` output values -- pass 2 for both algorithms here, but
 *     it must come from metadata.json (runtime_compatibility.num_classes)
 *     rather than being assumed, since a differently-configured DQN could
 *     have a different total action count.
 *
 * @param {Float32Array|number[]} output
 * @param {number} numClasses - how many leading output values represent
 *   the binary classification (see note above; typically 2).
 * @returns {{ predictedAction: number, confidenceScore: number }}
 */
function interpretOutput(output, numClasses = 2) {
  const values = Array.from(output).slice(0, numClasses);
  const maxVal = Math.max(...values);
  const expValues = values.map((v) => Math.exp(v - maxVal));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  const probabilities = expValues.map((v) => v / sumExp);

  const predictedAction = probabilities.indexOf(Math.max(...probabilities));
  const confidenceScore = probabilities[1] ?? probabilities[predictedAction];

  return { predictedAction, confidenceScore };
}

module.exports = { loadSession, runInference, interpretOutput };
