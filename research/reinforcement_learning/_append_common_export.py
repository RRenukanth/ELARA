"""
One-off script to append "export to a Node-loadable format" cells to the
three RL notebooks, right after their existing "Export Best-Performing Fold
Model" cell. Not part of the research pipeline itself -- delete after running.

DQN/PPO -> also export best_model/model.onnx (loaded by
           backend/services/adapters/onnxAdapter.js)
Q-Learning -> also export best_model/model.json (loaded by
           backend/services/adapters/qtableAdapter.js)
"""
import json
import uuid


def new_cell(cell_type, source_lines):
    cell = {"cell_type": cell_type, "id": uuid.uuid4().hex[:8], "metadata": {}, "source": source_lines}
    if cell_type == "code":
        cell["execution_count"] = None
        cell["outputs"] = []
    return cell


def src(text):
    lines = text.strip("\n").split("\n")
    return [line + "\n" for line in lines[:-1]] + [lines[-1]]


DQN_MARKDOWN = "### 24. Export to ONNX (Node-Loadable Format for the Backend)"

DQN_CODE = '''
# ==========================================================
# Export the Best-Performing Fold Model to ONNX
#
# The backend (Node.js) cannot load a PyTorch .pth checkpoint directly.
# ONNX is an open, framework-neutral format the backend's onnxAdapter.js
# can run via onnxruntime-node. This exports the SAME best-fold model
# selected in the previous cell, in addition to (not instead of) model.pth.
#
# IMPORTANT: onnxruntime-node (the backend's ONNX runtime) only supports
# ONNX IR version <= 10. torch.onnx.export() normally produces a compatible
# IR version automatically -- if you see "Unsupported model IR version"
# when the backend loads this file, re-export with a lower opset_version.
# ==========================================================
import torch

best_policy_network = DeepQNetwork(STATE_SIZE, ACTION_SIZE).to(device)
best_policy_network.load_state_dict(torch.load(best_model_path, map_location=device))
best_policy_network.eval()

onnx_path = os.path.join(BEST_MODEL_DIR, "model.onnx")
dummy_input = torch.randn(1, STATE_SIZE, device=device)

torch.onnx.export(
    best_policy_network,
    dummy_input,
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    opset_version=13,
)

print(f"ONNX model exported to: {onnx_path}")

# Record how the backend should interpret this model's output and which
# input tensor name to feed (see models/README.md, "runtime_compatibility").
# DQN's raw output has ACTION_SIZE = NUM_FEATURES * 3 values (a
# feature-modification action space), but this notebook's own evaluation
# cell above only uses the FIRST TWO as a binary classifier signal
# (q_values[:, :2]) -- num_classes tells the backend to do the same.
metadata["runtime_compatibility"]["export_format"] = "onnx"
metadata["runtime_compatibility"]["input_name"] = "input"
metadata["runtime_compatibility"]["num_classes"] = 2

with open(metadata_path, "w") as f:
    json.dump(metadata, f, indent=2)
print(f"Updated metadata.json with ONNX runtime_compatibility fields.")

try:
    from google.colab import files
    files.download(onnx_path)
    files.download(metadata_path)
    print("\\nDownload triggered for best_model/model.onnx and updated metadata.json")
except ImportError:
    print(f"\\nNot running in Google Colab -- file available locally at: {onnx_path}")
'''

PPO_MARKDOWN = "### 35. Export to ONNX (Node-Loadable Format for the Backend)"

PPO_CODE = '''
# ==========================================================
# Export the Best-Performing Fold Model to ONNX
#
# The backend (Node.js) cannot load a PyTorch .pth checkpoint directly.
# ONNX is an open, framework-neutral format the backend's onnxAdapter.js
# can run via onnxruntime-node. This exports the SAME best-fold model
# selected in the previous cell, in addition to (not instead of) model.pth.
# Only the actor network is exported -- inference only needs action
# probabilities, not the critic's value estimate.
#
# IMPORTANT: onnxruntime-node (the backend's ONNX runtime) only supports
# ONNX IR version <= 10. torch.onnx.export() normally produces a compatible
# IR version automatically -- if you see "Unsupported model IR version"
# when the backend loads this file, re-export with a lower opset_version.
# ==========================================================
import torch

class ActorOnly(torch.nn.Module):
    """Wraps ActorCritic.shared + .actor for a clean single-output ONNX graph."""
    def __init__(self, actor_critic):
        super().__init__()
        self.shared = actor_critic.shared
        self.actor = actor_critic.actor

    def forward(self, state):
        return self.actor(self.shared(state))

best_state_dimension = 10  # per receive_patient_features() -- verify against models/README.md "Known gap"
best_agent_for_export = PPOAgent(best_state_dimension)
checkpoint = torch.load(best_model_path, map_location=torch.device("cpu"))
best_agent_for_export.policy.load_state_dict(checkpoint["actor_state_dict"])
best_agent_for_export.policy.critic.load_state_dict(checkpoint["critic_state_dict"])
best_agent_for_export.policy.eval()

actor_only_model = ActorOnly(best_agent_for_export.policy)
actor_only_model.eval()

onnx_path = os.path.join(BEST_MODEL_DIR, "model.onnx")
dummy_input = torch.randn(1, best_state_dimension)

torch.onnx.export(
    actor_only_model,
    dummy_input,
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    opset_version=13,
)

print(f"ONNX model exported to: {onnx_path}")

# PPO's ACTION_SIZE = 2 -- a genuine binary classifier output, unlike DQN.
metadata["runtime_compatibility"]["export_format"] = "onnx"
metadata["runtime_compatibility"]["input_name"] = "input"
metadata["runtime_compatibility"]["num_classes"] = 2

with open(metadata_path, "w") as f:
    json.dump(metadata, f, indent=2)
print(f"Updated metadata.json with ONNX runtime_compatibility fields.")

try:
    from google.colab import files
    files.download(onnx_path)
    files.download(metadata_path)
    print("\\nDownload triggered for best_model/model.onnx and updated metadata.json")
except ImportError:
    print(f"\\nNot running in Google Colab -- file available locally at: {onnx_path}")
'''

QLEARNING_MARKDOWN = "### 26. Export to JSON (Node-Loadable Format for the Backend)"

QLEARNING_CODE = '''
# ==========================================================
# Export the Best-Performing Fold's Q-Table to JSON
#
# The backend (Node.js) cannot unpickle a Python .pkl file. Since a Q-table
# is just a dict (no neural network), plain JSON is sufficient -- no ML
# runtime is needed on the backend side. This exports the SAME Q-table
# already saved to model.pkl, in addition to (not instead of) that file.
#
# Q-table keys are Python tuples in memory; JSON has no tuple type, so keys
# are serialized as JSON array strings (e.g. "[0,1,2,...]") -- this exact
# format must match backend/services/adapters/qtableAdapter.js's
# discretizeState() output.
# ==========================================================
import json

json_path = os.path.join(BEST_MODEL_DIR, "model.json")

serializable_q_table = {
    json.dumps(list(int(v) for v in state_key)): list(float(v) for v in action_values)
    for state_key, action_values in best_agent.q_table.items()
}

with open(json_path, "w") as f:
    json.dump({
        "action_size": best_agent.action_size,
        "num_bins": NUM_BINS,
        "q_table": serializable_q_table,
    }, f, indent=2)

print(f"Q-table exported as JSON to: {json_path}")
print(f"Number of discretized states in table: {len(serializable_q_table)}")

metadata["runtime_compatibility"]["export_format"] = "json"

with open(metadata_path, "w") as f:
    json.dump(metadata, f, indent=2)
print(f"Updated metadata.json with export_format.")

try:
    from google.colab import files
    files.download(json_path)
    files.download(metadata_path)
    print("\\nDownload triggered for best_model/model.json and updated metadata.json")
except ImportError:
    print(f"\\nNot running in Google Colab -- file available locally at: {json_path}")
'''


def append_cells(notebook_path, markdown_text, code_text):
    with open(notebook_path, encoding="utf-8") as f:
        nb = json.load(f)

    nb["cells"].append(new_cell("markdown", src(markdown_text)))
    nb["cells"].append(new_cell("code", src(code_text)))

    with open(notebook_path, "w", encoding="utf-8") as f:
        json.dump(nb, f, indent=1, ensure_ascii=False)
        f.write("\n")

    print(f"Appended export cells to {notebook_path}")


if __name__ == "__main__":
    append_cells("EHR_DQN_PyTorch.ipynb", DQN_MARKDOWN, DQN_CODE)
    append_cells("PPO.ipynb", PPO_MARKDOWN, PPO_CODE)
    append_cells("Q_Learning.ipynb", QLEARNING_MARKDOWN, QLEARNING_CODE)
