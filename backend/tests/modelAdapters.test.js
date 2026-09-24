const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const onnxAdapter = require("../services/adapters/onnxAdapter");
const qtableAdapter = require("../services/adapters/qtableAdapter");
const layersAdapter = require("../services/adapters/layersAdapter");

// A minimal, valid ONNX model (input[1,15] -> MatMul+Add -> output[1,2]),
// pre-generated with ir_version=9 so it is loadable by the installed
// onnxruntime-node version (onnxruntime-node 1.20.x supports up to IR v10;
// newer onnx-python defaults to a higher IR version that fails to load --
// see backend/services/adapters/onnxAdapter.js for context). Stored as a
// fixture rather than generated at test time since Node has no ONNX writer.
const FIXTURE_ONNX_PATH = path.join(__dirname, "fixtures", "tiny_model.onnx");

test("onnxAdapter loads a model and runs inference producing a valid probability", async () => {
  const session = await onnxAdapter.loadSession(FIXTURE_ONNX_PATH);
  assert.ok(session.inputNames.length > 0);
  assert.ok(session.outputNames.length > 0);

  const vector = new Array(15).fill(0).map((_, i) => i * 0.1 - 0.7);
  const output = await onnxAdapter.runInference(session, vector, session.inputNames[0]);
  assert.equal(output.length, 2);

  const { predictedAction, confidenceScore } = onnxAdapter.interpretOutput(output);
  assert.ok(predictedAction === 0 || predictedAction === 1);
  assert.ok(confidenceScore >= 0 && confidenceScore <= 1);
});

test("onnxAdapter.interpretOutput turns logits into a normalized probability", () => {
  const { confidenceScore, predictedAction } = onnxAdapter.interpretOutput([1.0, 3.0]);
  assert.equal(predictedAction, 1);
  assert.ok(confidenceScore > 0.5 && confidenceScore < 1);
});

test("onnxAdapter.interpretOutput only considers the first numClasses values (DQN's 45-action output case)", () => {
  // Simulates a DQN output where q_values[0:2] are the binary classifier
  // signal (per EHR_DQN_PyTorch.ipynb's evaluation cell), but the full
  // output vector has many more feature-modification action values after
  // it that must be ignored.
  const dqnStyleOutput = [0.1, 5.0, 9.9, 9.9, 9.9, -9.9, -9.9];
  const { confidenceScore, predictedAction } = onnxAdapter.interpretOutput(dqnStyleOutput, 2);
  assert.equal(predictedAction, 1); // index 1 (5.0) > index 0 (0.1) among first 2 only
  assert.ok(confidenceScore > 0.9); // 0.1 vs 5.0 is a strongly separated softmax
});

let qtableTmpDir;
let qtableModelPath;
let layersTmpDir;
let layersModelPath;

before(() => {
  qtableTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x-reach-qtable-test-"));
  qtableModelPath = path.join(qtableTmpDir, "model.json");
  fs.writeFileSync(
    qtableModelPath,
    JSON.stringify({
      action_size: 2,
      num_bins: 3,
      q_table: {
        "[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]": [0.2, 0.8],
        "[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]": [0.9, 0.1],
      },
    })
  );

  // Tiny hand-computable network: 2 -> Linear(3) -> ReLU -> Linear(2) -> Softmax.
  // For input [2, -1]:
  //   layer 1 pre-activation = [2*1+(-1)*0, 2*0+(-1)*1, 2*1+(-1)*1] = [2, -1, 1]
  //   after ReLU                                                    = [2, 0, 1]
  //   layer 2 pre-activation = [2+0+1, 0+0+1]                        = [3, 1]
  //   softmax([3, 1])                                                 ~= [0.8808, 0.1192]
  layersTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "x-reach-layers-test-"));
  layersModelPath = path.join(layersTmpDir, "weights.json");
  fs.writeFileSync(
    layersModelPath,
    JSON.stringify({
      input_dim: 2,
      layers: [
        { type: "linear", weight: [[1, 0], [0, 1], [1, 1]], bias: [0, 0, 0] },
        { type: "relu" },
        { type: "linear", weight: [[1, 1, 1], [0, 0, 1]], bias: [0, 0] },
        { type: "softmax" },
      ],
    })
  );
});

after(() => {
  fs.rmSync(qtableTmpDir, { recursive: true, force: true });
  fs.rmSync(layersTmpDir, { recursive: true, force: true });
});

test("qtableAdapter.discretizeState clips and bins values matching the training notebook's logic", () => {
  assert.equal(qtableAdapter.discretizeState(new Array(15).fill(-1), 3), JSON.stringify(new Array(15).fill(0)));
  assert.equal(qtableAdapter.discretizeState(new Array(15).fill(2), 3), JSON.stringify(new Array(15).fill(2)));
  assert.equal(qtableAdapter.discretizeState(new Array(15).fill(0.5), 3), JSON.stringify(new Array(15).fill(1)));
});

test("qtableAdapter.predict returns a known state's Q-values-derived confidence", () => {
  const model = qtableAdapter.loadQTable(qtableModelPath);
  const result = qtableAdapter.predict(model, new Array(15).fill(0));
  assert.equal(result.isUnknownState, false);
  assert.ok(result.confidenceScore > 0.5); // [0.2, 0.8] -> action 1 favored
});

test("qtableAdapter.predict falls back to 0.5 confidence for an unseen state", () => {
  const model = qtableAdapter.loadQTable(qtableModelPath);
  const result = qtableAdapter.predict(model, new Array(15).fill(0.5));
  assert.equal(result.isUnknownState, true);
  assert.equal(result.confidenceScore, 0.5);
});

test("layersAdapter.runInference reproduces a hand-computed linear+relu+softmax forward pass", () => {
  const model = layersAdapter.loadWeights(layersModelPath);
  assert.equal(model.inputDim, 2);

  const output = layersAdapter.runInference(model, [2, -1]);
  assert.equal(output.length, 2);
  assert.ok(Math.abs(output[0] - 0.8808) < 1e-3);
  assert.ok(Math.abs(output[1] - 0.1192) < 1e-3);
  assert.ok(Math.abs(output[0] + output[1] - 1) < 1e-9); // softmax sums to 1
});

test("layersAdapter.runInference returns raw (non-normalized) values when the layer list has no trailing softmax", () => {
  const rawModel = {
    inputDim: 2,
    layers: [
      { type: "linear", weight: [[1, 0], [0, 1], [1, 1]], bias: [0, 0, 0] },
      { type: "relu" },
      { type: "linear", weight: [[1, 1, 1], [0, 0, 1]], bias: [0, 0] },
    ],
  };
  const output = layersAdapter.runInference(rawModel, [2, -1]);
  assert.deepEqual(output, [3, 1]); // matches the pre-softmax logits from the hand-computed case above
});
