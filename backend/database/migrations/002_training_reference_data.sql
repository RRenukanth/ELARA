-- ELARA Backend - Training Reference Data (SQLite)
--
-- Stores the cleaned reference dataset (research/data/heart_disease_trimmed.csv,
-- 539 rows derived from the raw UCI heart_disease_uci.csv, containing ONLY the
-- ten canonical model features -- see backend/utils/featureContract.js) plus the
-- fitted RobustScaler parameters used to preprocess them for the RL models.
--
-- Purpose:
--   1. Gives the backend a queryable source of the exact reference statistics
--      (median/IQR) used to preprocess new patient input consistently with
--      how the RL models were trained (see backend/services/preprocessingService.js).
--   2. Provides a place to append future patient-submitted training data
--      (via is_patient_contributed) without losing the original reference
--      set, so any future re-fit of the scaler can be done deliberately and
--      versioned rather than silently drifting.
--
-- This table is reference/research data, not per-patient PII: no name, email,
-- or other identifying information is stored here (see security-and-privacy.md
-- on data minimization / de-identification for model-analysis data).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS training_reference_data (
    record_id             INTEGER PRIMARY KEY AUTOINCREMENT,

    -- canonical 10 features, in canonical order, using the SAME integer
    -- encodings as health_data (cp/restecg as canonical ints, not one-hot;
    -- one-hot expansion happens at preprocessing time, not storage time)
    thalach               REAL NOT NULL,
    restecg               INTEGER NOT NULL,
    oldpeak               REAL NOT NULL,
    slope                 INTEGER NOT NULL,
    age                   INTEGER NOT NULL,
    sex                   INTEGER NOT NULL CHECK(sex IN (0,1)),
    cp                    INTEGER NOT NULL,
    exang                 INTEGER NOT NULL CHECK(exang IN (0,1)),
    trestbps              REAL NOT NULL,
    fbs                   INTEGER NOT NULL CHECK(fbs IN (0,1)),

    target                INTEGER NOT NULL CHECK(target IN (0,1)),

    -- 'uci_reference' = original 539-row cleaned dataset from heart_disease_uci.csv
    -- 'patient_contributed' = added later from real patient submissions (requires
    --   explicit consent/process before use -- not automated by this migration)
    source                TEXT NOT NULL DEFAULT 'uci_reference'
                              CHECK(source IN ('uci_reference', 'patient_contributed')),

    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_training_reference_source ON training_reference_data(source);

-- =========================================================
-- FITTED PREPROCESSING PARAMETERS
-- One row per continuous feature, storing the RobustScaler statistics
-- (median, IQR) fitted on the reference data above. See
-- research/preprocessing/fit_preprocessing_params.py for how these were
-- computed, and models/rl/preprocessing_params.json for the canonical
-- exported copy consumed by the research notebooks.
-- =========================================================
CREATE TABLE IF NOT EXISTS preprocessing_scaler_params (
    feature_name          TEXT PRIMARY KEY CHECK(feature_name IN ('age','trestbps','thalach','oldpeak')),
    median                REAL NOT NULL,
    q1                     REAL NOT NULL,
    q3                     REAL NOT NULL,
    iqr                    REAL NOT NULL,
    fitted_on_row_count    INTEGER NOT NULL,
    fitted_at              TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
