# Model Artifacts Contract

This directory holds **exported research artifacts** consumed by the production
application (`backend/`). The application must never silently retrain a model —
it only loads what the research pipeline exports here.

## Required contract for every exported model

Each subfolder (`rl/`, `lime/`, `hrflm/`) must contain, alongside the trained
weights, a `metadata.json` describing:

```json
{
  "model_version": "ppo-fold3-2026-08-12",
  "algorithm": "PPO",
  "feature_order": [
    "thalach", "restecg", "oldpeak", "slope", "age",
    "sex", "cp", "exang", "trestbps", "fbs"
  ],
  "preprocessing": {
    "encoding": "describe one-hot / scaling steps applied before training",
    "scaler_path": "scaler.pkl (if applicable)"
  },
  "training_metadata": {
    "dataset": "preprocessed_dataset_balanced_2026-07-04_07-32-05.csv",
    "fold": 3,
    "trained_on": "2026-08-12"
  },
  "evaluation_metadata": {
    "accuracy": 0.0,
    "precision": 0.0,
    "recall": 0.0,
    "f1": 0.0,
    "roc_auc": 0.0
  },
  "runtime_compatibility": {
    "framework": "pytorch",
    "min_python": "3.10",
    "export_format": "onnx",
    "input_name": "input",
    "num_classes": 2
  }
}
```

### `runtime_compatibility` fields consumed by `backend/services/modelService.js` (models/rl/)

| Field | Required for | Meaning |
|---|---|---|
| `export_format` | all | `"onnx"` (DQN/PPO) or `"json"` (Q-Learning) -- which adapter to load with. Node cannot read `.pth`/`.pkl` directly; see "Common loading framework" below. |
| `input_name` | onnx | The ONNX graph's input tensor name (varies by how the notebook's export call named it). Falls back to the model's first declared input if omitted. |
| `num_classes` | onnx | How many leading output values represent the binary risk classifier. **PPO outputs exactly 2 values** (a real binary classifier). **DQN outputs `NUM_FEATURES * 3` values** (a feature-modification action space) -- only the first `num_classes` (2) are used as a classifier signal, matching `EHR_DQN_PyTorch.ipynb`'s own evaluation cell (`q_values[:, :2]`). Defaults to 2 if omitted. |

### `runtime_compatibility` fields consumed by `backend/services/hrflmService.js` (models/hrflm/)

| Field | Meaning |
|---|---|
| `export_format` | Always `"json"` -- HRFLM's global explanation is precomputed data (a feature-importance ranking + metrics), not a model that needs a runtime to execute. |
| `report_file` | Filename of the JSON report to read (`hrflm_report.json`) -- see `models/hrflm/README.md`. |

## Common loading framework (Node.js backend)

DQN/PPO (PyTorch, `.pth`) and Q-Learning (`.pkl`) are three different training
frameworks producing three incompatible file formats -- none of which Node.js
can load natively. Rather than running a Python sidecar process, each
notebook exports an **additional, Node-loadable copy** alongside its native
checkpoint:

- **DQN / PPO** -> also export `model.onnx` (ONNX is an open, framework-
  neutral graph format). Loaded via `onnxruntime-node` in
  `backend/services/adapters/onnxAdapter.js`.
  - **IR version caveat**: `onnxruntime-node@1.20.x` only supports ONNX IR
    version <= 10. If exporting with the standalone `onnx` Python package
    (rather than `torch.onnx.export`, which normally produces a compatible
    version), explicitly pass `ir_version=9` to `onnx.helper.make_model()`
    or the load will fail with "Unsupported model IR version" (this was
    hit and fixed during adapter development, see
    `backend/tests/modelAdapters.test.js`).
- **Q-Learning** -> also export `model.json` (the Q-table is just a dict,
  not a neural network -- plain JSON is sufficient, no ML runtime needed).
  Loaded via `backend/services/adapters/qtableAdapter.js`.

`backend/services/modelService.js` reads `metadata.json`'s
`runtime_compatibility.export_format` to decide which adapter to use, then
exposes one common `predict(features)` interface regardless of algorithm.
See the "Export to ONNX" / "Export to JSON" cells to add to each notebook
(next to the existing "Export Best-Performing Fold Model" cell) below.

The **canonical feature order is fixed** (see
`backend/utils/featureContract.js`):

| Position | Name       |
|----------|------------|
| 1        | thalach    |
| 2        | restecg    |
| 3        | oldpeak    |
| 4        | slope      |
| 5        | age        |
| 6        | sex        |
| 7        | cp         |
| 8        | exang      |
| 9        | trestbps   |
| 10       | fbs        |

## Status: trained models are live

`models/rl/` currently contains real, trained model artifacts for all three
algorithms: `ppo-fold4-2026-08-13/`, `dqn-fold5-2026-08-13/`, and
`qlearning-2026-08-13/`. The backend defaults to PPO for all predictions
(model selection by the client is intentionally disabled; see
`backend/controllers/predictionController.js`), while DQN and Q-Learning
remain fully loadable via `modelService.predict(features, { algorithm })`
if re-enabled later. `evaluation_metadata` in each `metadata.json` is `null`
for accuracy/precision/recall/f1/roc_auc, since these specific artifacts
were provided as pre-trained checkpoints without an accompanying
`evaluation_results.csv` from the training run -- see each file's
`evaluation_metadata.note` for prior research estimates that have not been
verified against these exact fold weights.

The research notebooks under `research/reinforcement_learning/` train on a
**15-dimension one-hot-encoded state** (categorical features `cp` and
`restecg` expanded into dummy columns, continuous features RobustScaler-
scaled), not the 10 raw canonical features above directly.

**The 10 → 15 preprocessing mismatch is resolved** via
`backend/services/preprocessingService.js`, which reproduces the exact
transformation used to build the training data (verified byte-for-byte
against `research/data/preprocessed_dataset_2026-07-04_07-18-06.csv`, see
`backend/tests/preprocessingService.test.js`). The pipeline:

1. `research/data/heart_disease_uci.csv` — raw, unpreprocessed source
   dataset (920 rows, Cleveland+Hungary+Switzerland+VA Long Beach).
2. `research/preprocessing/feature_selection.py` — selects only the 10
   canonical columns + target, encodes categoricals to the app's standard
   integer codes, drops rows with missing values in those columns (920 → 539
   rows) → `research/data/heart_disease_trimmed.csv`.
3. `research/preprocessing/fit_preprocessing_params.py` — fits RobustScaler
   statistics (median/IQR) on the trimmed data's continuous columns
   (age, trestbps, thalach, oldpeak) → `models/rl/preprocessing_params.json`.
4. `backend/database/seedTrainingReferenceData.js` — loads both of the above
   into SQLite (`training_reference_data`, `preprocessing_scaler_params`
   tables — see `backend/database/migrations/002_training_reference_data.sql`).
5. `backend/services/preprocessingService.js` — reads the scaler params from
   the database at runtime and converts new patient-submitted raw features
   into the same 15-dimension vector the RL models expect.

## Global explainability (HRFLM)

`models/hrflm/` holds the global (population-wide) explanation of the
active RL model's behavior -- see `models/hrflm/README.md` for the full
pipeline (`HRFLM.ipynb` + `hrflm_eval.ipynb`) and the admin-only backend/
frontend integration (`backend/services/hrflmService.js`,
`frontend/src/pages/admin/GlobalExplanationPage.jsx`).

### Re-fitting the scaler if patient-contributed data is added later

If real patient-submitted data is ever deliberately incorporated into
training (see `training_reference_data.source = 'patient_contributed'`),
re-fit `fit_preprocessing_params.py` on the combined dataset and re-run the
seeder — but note that changes the scaler for every existing feature value,
so any model trained under the old scaling must be retrained and given a
new `model_version`. Do not mix models and scalers from different fits.
