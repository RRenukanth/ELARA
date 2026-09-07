"""
Feature Selection and Cleaning
===============================
Takes the raw, unpreprocessed UCI heart disease dataset
(research/data/heart_disease_uci.csv, 920 rows / 16 columns from the
Cleveland+Hungary+Switzerland+VA Long Beach sites) and produces a trimmed
dataset containing ONLY the ten canonical model features (see
backend/utils/featureContract.js) plus the binarized target label.

This does NOT scale or one-hot encode anything -- it only:
  1. Selects the 10 canonical raw columns + num (source label)
  2. Encodes every categorical column to the SAME integer codes already
     used throughout the app (backend/utils/featureContract.js,
     frontend/src/utils/featureContract.js):
       sex:     Male=1, Female=0
       fbs:     True=1, False=0
       exang:   True=1, False=0
       slope:   downsloping=0, flat=1, upsloping=2
       cp:      typical angina=0, atypical angina=1, non-anginal=2, asymptomatic=3
       restecg: normal=0, st-t abnormality=1, lv hypertrophy=2
     (cp/restecg are one-hot expanded later, at inference/training time, by
     backend/services/preprocessingService.js -- keeping them as the
     canonical integers here matches how health_data already stores them.)
  3. Drops rows with a missing value in any of the 10 canonical columns
     (matches the row-count of the original research pipeline's
     preprocessed_dataset_*.csv: 539 rows, verified numerically)
  4. Binarizes the multi-class `num` label into `target` (0 = no disease,
     1 = disease present), matching the existing preprocessed_dataset_*.csv

Run this script from research/preprocessing/ (paths below are relative to
that directory, matching the convention of the other notebooks here).

Output: research/data/heart_disease_trimmed.csv
"""

import pandas as pd
import os

RAW_PATH = os.path.join("..", "data", "heart_disease_uci.csv")
OUTPUT_PATH = os.path.join("..", "data", "heart_disease_trimmed.csv")

# Canonical feature order (see backend/utils/featureContract.js).
# Source dataset spells the max-heart-rate column "thalch" (no 'a'); the
# canonical name used everywhere else in this project is "thalach".
CANONICAL_FEATURE_ORDER = [
    "thalach", "restecg", "oldpeak", "slope", "age",
    "sex", "cp", "exang", "trestbps", "fbs",
]

SOURCE_COLUMN_MAP = {
    "thalach": "thalch",  # rename to canonical spelling
}

SEX_MAP = {"Male": 1, "Female": 0}
BOOL_MAP = {True: 1, False: 0}
SLOPE_MAP = {"downsloping": 0, "flat": 1, "upsloping": 2}
CP_MAP = {"typical angina": 0, "atypical angina": 1, "non-anginal": 2, "asymptomatic": 3}
RESTECG_MAP = {"normal": 0, "st-t abnormality": 1, "lv hypertrophy": 2}


def load_and_clean():
    raw = pd.read_csv(RAW_PATH)

    subset = raw[[SOURCE_COLUMN_MAP.get(c, c) for c in CANONICAL_FEATURE_ORDER] + ["num"]].copy()
    subset.columns = CANONICAL_FEATURE_ORDER + ["num"]

    before = len(subset)
    subset = subset.dropna(subset=CANONICAL_FEATURE_ORDER).reset_index(drop=True)
    after = len(subset)
    print(f"Rows before dropping missing values: {before}")
    print(f"Rows after dropping missing values in the 10 canonical columns: {after}")

    subset["sex"] = subset["sex"].map(SEX_MAP)
    subset["fbs"] = subset["fbs"].map(BOOL_MAP)
    subset["exang"] = subset["exang"].map(BOOL_MAP)
    subset["slope"] = subset["slope"].map(SLOPE_MAP)
    subset["cp"] = subset["cp"].map(CP_MAP)
    subset["restecg"] = subset["restecg"].map(RESTECG_MAP)

    encoded_cols = ["sex", "fbs", "exang", "slope", "cp", "restecg"]
    if subset[encoded_cols].isna().any().any():
        raise ValueError(
            "Unexpected category value encountered during encoding -- check "
            "the *_MAP dictionaries above against the raw dataset's actual values."
        )

    for col in encoded_cols:
        subset[col] = subset[col].astype(int)

    subset["target"] = (subset["num"] > 0).astype(int)
    subset = subset.drop(columns=["num"])

    return subset[CANONICAL_FEATURE_ORDER + ["target"]]


def main():
    cleaned = load_and_clean()
    cleaned.to_csv(OUTPUT_PATH, index=False)
    print(f"\nSaved: {OUTPUT_PATH}")
    print(f"Shape: {cleaned.shape}")
    print("\nColumn dtypes:")
    print(cleaned.dtypes)
    print("\nTarget distribution:")
    print(cleaned["target"].value_counts())


if __name__ == "__main__":
    main()
