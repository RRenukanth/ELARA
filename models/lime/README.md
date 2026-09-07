# LIME Explainer Artifacts

LIME explanations must be generated against the exact same preprocessing and
feature mapping as the deployed model. Do not train a separate model for
explanation purposes.

Expected contents once the research LIME notebook
(`research/explainability/LIME.ipynb`) is fixed and its driver executes
end-to-end:

```
models/lime/
  explainer_config.json   # feature names, discretization settings
  metadata.json           # references the model_version it was built against
```

## Known issue

The current `LIME.ipynb` driver function (`explain_prediction_system`) calls
`load_prediction_model(model_name)` with only one argument, while the
function signature requires three (`model_name, model_path, model`). This
throws `TypeError` and the notebook never completes an end-to-end explanation
run. Fix this before exporting any LIME configuration here.

The notebook's own feature encoder assumes the **10 raw canonical features**
(matching the backend's canonical feature contract), which is inconsistent
with the 15-dimension state used to train the RL models. This must be
reconciled — see `../README.md`.
