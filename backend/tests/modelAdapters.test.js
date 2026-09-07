const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const onnxAdapter = require("../services/adapters/onnxAdapter");
const qtableAdapter = require("../services/adapters/qtableAdapter");

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

before(() => {
  qtableTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elara-qtable-test-"));
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
});

after(() => {
  fs.rmSync(qtableTmpDir, { recursive: true, force: true });
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
