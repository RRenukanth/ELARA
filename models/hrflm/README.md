# HRFLM Global Explainability Artifacts

HRFLM (Hybrid Random Forest with Linear Model) is used for **global**
explainability -- analyzing overall model behavior for developers,
researchers, and authorized model analysts. In this application, access
to HRFLM output is restricted to the **admin** role only (see
`backend/routes/adminRoutes.js` -- `GET /api/admin/hrflm/global-explanation`).

## Status: implemented

Two notebooks in `research/explainability/` implement and evaluate HRFLM:

- **`HRFLM.ipynb`** -- trains a hybrid Random Forest + Logistic Regression
  surrogate against the real, loaded PPO model's own predictions (not the
  ground-truth diagnosis label -- matching the same "must operate against
  the exact same model" principle already required of LIME). Combines
  normalized RF Gini importances and
  normalized `|Logistic Regression coefficients|` into one global
  feature-importance ranking. Exports `hrflm_report.json` + `metadata.json`
  (and the fitted `scaler.pkl` / `random_forest.pkl` / `linear_model.pkl`
  for offline reproducibility) to `models/hrflm/<version>/`.
- **`hrflm_eval.ipynb`** -- evaluates the HRFLM surrogate using the SAME
  eight explainability-quality metrics as `lime_eval.ipynb` (Fidelity,
  Accuracy Gain, Agreement, Stability, Sparsity, Deletion AUC, Insertion
  AUC, Reward Improvement), computed GLOBALLY across the whole reference
  dataset rather than per-instance. Deletion/Insertion AUC is the
  faithfulness check the other metrics don't cover: it ranks features by
  `hybrid_importance` and progressively baselines/restores them against the
  REAL PPO model's own confidence (not the surrogate's), directly testing
  whether the global importance ranking matches what the real model
  actually relies on. Exports `hrflm_eval_metrics.json` into the same
  version folder.

## Artifact contract

```
models/hrflm/<version>/
  metadata.json              # algorithm: "HRFLM", audience: "admin-only",
                              # runtime_compatibility.report_file points at hrflm_report.json
  hrflm_report.json           # global_feature_importance ranking + surrogate_fit_quality
  hrflm_eval_metrics.json      # Fidelity / Accuracy Gain / Agreement / Stability / Sparsity / Deletion AUC / Insertion AUC / Reward Improvement
  scaler.pkl                   # fitted StandardScaler (offline reproducibility only)
  random_forest.pkl            # fitted RandomForestClassifier (offline reproducibility only)
  linear_model.pkl             # fitted LogisticRegression (offline reproducibility only)
```

`backend/services/hrflmService.js` discovers the newest `models/hrflm/<version>/`
folder (by folder-name sort, versions are date-stamped e.g. `hrflm-2026-08-14`)
and reads `hrflm_report.json` + `hrflm_eval_metrics.json` directly -- no
Python/scikit-learn runtime is required on the Node.js side, since the
global explanation is precomputed, plain JSON data (unlike LIME, which is
computed per-request against a live loaded model). Consumed by
`backend/controllers/adminController.js`'s `getGlobalExplanation` and
exposed at `GET /api/admin/hrflm/global-explanation`, gated by the existing
`authenticate` + `authorize("admin")` middleware in `adminRoutes.js`.

## Frontend

`frontend/src/pages/admin/GlobalExplanationPage.jsx` (route
`/admin/global-explanation`, admin-only via `ProtectedRoute`) renders the
feature-importance ranking (`FeatureImportanceChart.jsx`) and the
explainability metrics as stat cards. Linked from the admin dashboard nav.
Deletion/Insertion AUC are computed and exported by `hrflm_eval.ipynb` but
are not yet surfaced as dedicated stat cards on this page -- see "Next
steps" below.

## Re-running with a different trained model

If the active RL model (`models/rl/`) is ever retrained/replaced, re-run
`HRFLM.ipynb` then `hrflm_eval.ipynb` against the new model file to produce a
new `models/hrflm/<version>/` folder -- `hrflm_report.json`'s
`explains_model_version` field records which `models/rl/` model each HRFLM
export corresponds to, so a stale explanation is always traceable to the
model version it was actually generated from.
