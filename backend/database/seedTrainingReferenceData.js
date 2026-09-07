// One-time (idempotent) seeder: loads the cleaned reference dataset
// (research/data/heart_disease_trimmed.csv) and the fitted RobustScaler
// parameters (models/rl/preprocessing_params.json) into SQLite, so the
// backend can look up preprocessing statistics from the database instead
// of re-reading files at request time.
//
// Usage: node database/seedTrainingReferenceData.js   (from backend/)
//
// Safe to re-run: clears and reloads both tables each time (this is
// reference/research data, not per-patient records -- see
// migrations/002_training_reference_data.sql for the data-minimization
// rationale).

const fs = require("fs");
const path = require("path");
const { db, run, transaction } = require("./db");

const TRIMMED_CSV_PATH = path.resolve(
  __dirname, "..", "..", "research", "data", "heart_disease_trimmed.csv"
);
const PREPROCESSING_PARAMS_PATH = path.resolve(
  __dirname, "..", "..", "models", "rl", "preprocessing_params.json"
);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    header.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  });
}

function seedReferenceData() {
  if (!fs.existsSync(TRIMMED_CSV_PATH)) {
    throw new Error(
      `${TRIMMED_CSV_PATH} not found. Run research/preprocessing/feature_selection.py first.`
    );
  }

  const rows = parseCsv(fs.readFileSync(TRIMMED_CSV_PATH, "utf8"));

  transaction(() => {
    run("DELETE FROM training_reference_data WHERE source = 'uci_reference'");

    for (const row of rows) {
      run(
        `INSERT INTO training_reference_data (
          thalach, restecg, oldpeak, slope, age, sex, cp, exang, trestbps, fbs, target, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uci_reference')`,
        [
          Number(row.thalach),
          Number(row.restecg),
          Number(row.oldpeak),
          Number(row.slope),
          Number(row.age),
          Number(row.sex),
          Number(row.cp),
          Number(row.exang),
          Number(row.trestbps),
          Number(row.fbs),
          Number(row.target),
        ]
      );
    }
  });

  console.log(`Seeded ${rows.length} rows into training_reference_data (source='uci_reference').`);
}

function seedScalerParams() {
  if (!fs.existsSync(PREPROCESSING_PARAMS_PATH)) {
    throw new Error(
      `${PREPROCESSING_PARAMS_PATH} not found. Run research/preprocessing/fit_preprocessing_params.py first.`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(PREPROCESSING_PARAMS_PATH, "utf8"));
  const columns = artifact.scaler.columns;
  const rowCount = artifact.row_count;

  transaction(() => {
    run("DELETE FROM preprocessing_scaler_params");

    for (const [featureName, stats] of Object.entries(columns)) {
      run(
        `INSERT INTO preprocessing_scaler_params (feature_name, median, q1, q3, iqr, fitted_on_row_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [featureName, stats.median, stats.q1, stats.q3, stats.iqr, rowCount]
      );
    }
  });

  console.log(`Seeded ${Object.keys(columns).length} scaler parameter rows into preprocessing_scaler_params.`);
}

function main() {
  seedReferenceData();
  seedScalerParams();
}

main();
