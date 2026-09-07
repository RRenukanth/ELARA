"""
Fit Preprocessing Parameters
==============================
Fits the RobustScaler statistics (median, IQR) for the four continuous
canonical features (age, trestbps, thalach, oldpeak) on the cleaned
reference dataset produced by feature_selection.py, and writes them to a
single JSON artifact that BOTH the research notebooks and the production
backend can load -- this is what lets new patient-submitted data be
transformed identically to the data the RL models were trained on.

This script does not use scikit-learn (not guaranteed to be available in
every environment that consumes this artifact); the RobustScaler formula
is simple enough to compute directly with pandas:

    scaled = (raw - median) / IQR      where IQR = Q3 - Q1 (25th/75th pctile)

Verified to reproduce research/data/preprocessed_dataset_2026-07-04_07-18-06.csv
to floating-point precision (max abs diff ~4e-16) using this exact formula.

Also records the fixed category order used for one-hot expansion of `cp`
and `restecg`, and the integer encodings for the other categorical fields,
so a single artifact fully describes "raw canonical 10 -> trained N-dim
state" preprocessing.

Output: models/rl/preprocessing_params.json
"""

import json
import os
import pandas as pd

TRIMMED_PATH = os.path.join("..", "data", "heart_disease_trimmed.csv")
OUTPUT_PATH = os.path.join("..", "..", "models", "rl", "preprocessing_params.json")

CONTINUOUS_COLUMNS = ["age", "trestbps", "thalach", "oldpeak"]

# Fixed category order for one-hot expansion -- must never be reordered
# once a model has been trained against it (see models/README.md).
CP_CATEGORY_ORDER = ["cp_asymptomatic", "cp_atypical angina", "cp_non-anginal", "cp_typical angina"]
RESTECG_CATEGORY_ORDER = ["restecg_lv hypertrophy", "restecg_normal", "restecg_st-t abnormality"]

# Maps the canonical integer codes (used in health_data / the app's
# featureContract.js) back to the one-hot column each value activates.
CP_INT_TO_ONEHOT = {
    0: "cp_typical angina",
    1: "cp_atypical angina",
    2: "cp_non-anginal",
    3: "cp_asymptomatic",
}
RESTECG_INT_TO_ONEHOT = {
    0: "restecg_normal",
    1: "restecg_st-t abnormality",
    2: "restecg_lv hypertrophy",
}


def fit_robust_scaler_params(df):
    params = {}
    for col in CONTINUOUS_COLUMNS:
        values = df[col].astype(float)
        median = float(values.median())
        q1 = float(values.quantile(0.25))
        q3 = float(values.quantile(0.75))
        iqr = q3 - q1
        params[col] = {"median": median, "iqr": iqr, "q1": q1, "q3": q3}
    return params


def main():
    df = pd.read_csv(TRIMMED_PATH)

    scaler_params = fit_robust_scaler_params(df)

    artifact = {
        "description": (
            "Preprocessing parameters fitted on research/data/heart_disease_trimmed.csv "
            "(539 rows, cleaned from research/data/heart_disease_uci.csv). Reproduces "
            "research/data/preprocessed_dataset_2026-07-04_07-18-06.csv exactly. "
            "Use this artifact to transform new raw patient input into the same "
            "15-dimension representation the RL models were trained on."
        ),
        "source_reference_data": "research/data/heart_disease_trimmed.csv",
        "row_count": len(df),
        "scaler": {
            "method": "robust",
            "formula": "(raw_value - median) / iqr",
            "columns": scaler_params,
        },
        "categorical_encoding": {
            "sex": {"Male": 1, "Female": 0},
            "fbs": {"True": 1, "False": 0},
            "exang": {"True": 1, "False": 0},
            "slope": {"downsloping": 0, "flat": 1, "upsloping": 2},
            "cp_canonical_int": {"typical angina": 0, "atypical angina": 1, "non-anginal": 2, "asymptomatic": 3},
            "restecg_canonical_int": {"normal": 0, "st-t abnormality": 1, "lv hypertrophy": 2},
        },
        "one_hot_expansion": {
            "cp": {
                "category_order": CP_CATEGORY_ORDER,
                "canonical_int_to_column": CP_INT_TO_ONEHOT,
            },
            "restecg": {
                "category_order": RESTECG_CATEGORY_ORDER,
                "canonical_int_to_column": RESTECG_INT_TO_ONEHOT,
            },
        },
        "trained_feature_order_15dim": [
            "sex", "fbs", "exang", "age", "trestbps", "thalach", "oldpeak",
            "cp_asymptomatic", "cp_atypical angina", "cp_non-anginal", "cp_typical angina",
            "restecg_lv hypertrophy", "restecg_normal", "restecg_st-t abnormality",
            "slope",
        ],
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(artifact, f, indent=2)

    print(f"Saved: {OUTPUT_PATH}")
    print(json.dumps(scaler_params, indent=2))


if __name__ == "__main__":
    main()
