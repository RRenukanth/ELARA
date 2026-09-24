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
 * IMPORTANT: PPO and DQN do NOT have the same output shape OR the same
 * output activation in these notebooks.
 *   - PPO: ACTION_SIZE = 2 -- a genuine binary classifier output, and its
 *     actor head ends in its own softmax layer (see PPO.ipynb's
 *     ActorCritic: `actor(128->128->2, softmax)`). The exported ONNX
 *     output is therefore ALREADY a normalized probability distribution
 *     (index 0 = "No Heart Disease", index 1 = "Heart Disease") -- it
 *     must be used as-is. Applying softmax to it AGAIN would compress
 *     every near-certain prediction towards the same two values
 *     (softmax([1,0]) and softmax([0,1]) regardless of how close to 0/1
 *     the original probabilities were), destroying the model's actual
 *     confidence signal.
 *   - DQN: ACTION_SIZE = NUM_FEATURES * 3 (increase/decrease/hold per
 *     feature -- a feature-modification action space, not a classifier),
 *     and its final layer is a plain Linear layer (raw Q-values, not
 *     probabilities). The notebook's own evaluation cell repurposes this
 *     by taking only the FIRST TWO Q-values as a binary classifier
 *     (`torch.argmax(q_values[:, :2], dim=1)` in EHR_DQN_PyTorch.ipynb)
 *     and these DO need softmax to become comparable probabilities.
 *
 * Which case applies is read from metadata.json's
 * runtime_compatibility.output_activation ("softmax" | "none") rather than
 * assumed from the algorithm name, since it describes a property of the
 * specific exported ONNX graph.
 *
 * @param {Float32Array|number[]} output
 * @param {number} numClasses - how many leading output values represent
 *   the binary classification (see note above; typically 2).
 * @param {"softmax"|"none"} [outputActivation] - "softmax" if the ONNX
 *   graph's own final layer already normalizes `output` into
 *   probabilities (apply it as-is); "none" (default) if `output` is raw
 *   logits/Q-values that this function must still normalize itself.
 * @returns {{ predictedAction: number, confidenceScore: number }}
 */
function interpretOutput(output, numClasses = 2, outputActivation = "none") {
  const values = Array.from(output).slice(0, numClasses);

  let probabilities;
  if (outputActivation === "softmax") {
    probabilities = values;
  } else {
    const maxVal = Math.max(...values);
    const expValues = values.map((v) => Math.exp(v - maxVal));
    const sumExp = expValues.reduce((a, b) => a + b, 0);
    probabilities = expValues.map((v) => v / sumExp);
  }

  const predictedAction = probabilities.indexOf(Math.max(...probabilities));
  const confidenceScore = probabilities[1] ?? probabilities[predictedAction];

  return { predictedAction, confidenceScore };
}

module.exports = { loadSession, runInference, interpretOutput };
