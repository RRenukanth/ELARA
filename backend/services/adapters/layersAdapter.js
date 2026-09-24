// Layers adapter for DQN/PPO models exported as plain JSON weights.
//
// PyTorch has no native Node.js runtime, and onnxruntime-node pulls in a
// native binary dependency some deployments would rather avoid entirely.
// This adapter avoids both: the training notebook dumps each Linear
// layer's weight matrix + bias vector (and the ReLU/Softmax layers between
// them) as a plain JSON array list, in forward-pass order, with Dropout
// layers omitted (a no-op at inference time). This adapter just replays
// that layer list with plain JS arithmetic -- the same pattern already
// used for Q-Learning's model.json + qtableAdapter.js, just for a small
// feedforward network instead of a lookup table.
//
// See the "Export the best fold for the backend (no ONNX)" cell in
// research/reinforcement_learning/X-REACH_DQN_Training.ipynb /
// X-REACH_PPO_Training.ipynb for the exporter, which also verifies the
// exported JSON reproduces the live PyTorch model's output before
// downloading it.

const fs = require("fs");

/**
 * Load a JSON-exported layer-list artifact from disk.
 * @param {string} jsonPath
 * @returns {{ inputDim: number, layers: Array<{type: "linear", weight: number[][], bias: number[]} | {type: "relu"} | {type: "softmax"}> }}
 */
function loadWeights(jsonPath) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return { inputDim: raw.input_dim, layers: raw.layers };
}

/**
 * Run a single Linear layer: out[i] = bias[i] + sum_j weight[i][j] * x[j].
 * weight is [out_features][in_features], matching PyTorch's own
 * nn.Linear.weight layout -- see the exporter's comment for why.
 */
function linear(weight, bias, x) {
  const out = new Array(weight.length);
  for (let i = 0; i < weight.length; i++) {
    const row = weight[i];
    let sum = bias[i];
    for (let j = 0; j < row.length; j++) {
      sum += row[j] * x[j];
    }
    out[i] = sum;
  }
  return out;
}

function relu(x) {
  return x.map((v) => (v > 0 ? v : 0));
}

function softmax(x) {
  const maxVal = Math.max(...x);
  const expValues = x.map((v) => Math.exp(v - maxVal));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  return expValues.map((v) => v / sumExp);
}

/**
 * Run inference for a single feature vector through the exported layer
 * list, in order.
 *
 * @param {{ inputDim: number, layers: object[] }} model
 * @param {number[]} featureVector - already preprocessed (e.g. via
 *   preprocessingService.toTrainedRepresentation()), in the exact order
 *   the model was trained on.
 * @returns {number[]} the final layer's output (raw Q-values for DQN,
 *   already-softmaxed action probabilities for PPO -- see the model's
 *   metadata.json runtime_compatibility.output_activation for which).
 */
function runInference(model, featureVector) {
  let x = featureVector;
  for (const layer of model.layers) {
    if (layer.type === "linear") {
      x = linear(layer.weight, layer.bias, x);
    } else if (layer.type === "relu") {
      x = relu(x);
    } else if (layer.type === "softmax") {
      x = softmax(x);
    } else {
      throw new Error(`Unsupported layer type in exported weights: ${layer.type}`);
    }
  }
  return x;
}

module.exports = { loadWeights, runInference };
