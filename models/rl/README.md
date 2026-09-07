# RL Model Artifacts

Place exported reinforcement learning model weights here, one subfolder per
algorithm/version, e.g.:

```
models/rl/
  ppo-fold3-2026-08-12/
    model.pth
    metadata.json
  dqn-fold1-2026-08-12/
    model.pth
    metadata.json
```

See `../README.md` for the required `metadata.json` contract and the current
known 10-vs-15 feature dimension gap that blocks production use.

Per research findings (see project history), relative performance of the
three trained algorithms was:

| Algorithm  | Avg Accuracy | Avg ROC-AUC | Notes |
|------------|-------------|-------------|-------|
| PPO        | ~0.78       | ~0.85       | Best performer; inference demo cell had a checkpoint shape-mismatch bug that must be fixed before export |
| Q-Learning | ~0.60       | ~0.67       | High precision, low recall |
| DQN        | ~0.50       | ~0.44       | Below chance on ROC-AUC; environment/action-space likely needs rework before use |

No `model_version` should be marked as the active production model until it
has an accompanying `metadata.json` and has been validated against the
10-feature raw input contract.
