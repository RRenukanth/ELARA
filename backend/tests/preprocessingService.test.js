const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

// This test needs its own isolated, migrated + SEEDED database (unlike the
// other test files, which only need migrations -- see tests/helpers/testServer.js).
// Set up an isolated temp DB here directly rather than depending on the
// developer having run `node database/seedTrainingReferenceData.js` against
// the real backend/database/elara.db first.

const TRIMMED_CSV_PATH = path.resolve(__dirname, "..", "..", "research", "data", "heart_disease_trimmed.csv");
const ORIGINAL_PREPROCESSED_CSV_PATH = path.resolve(
  __dirname, "..", "..", "research", "data", "preprocessed_dataset_2026-07-04_07-18-06.csv"
);

let tmpDir;
let toTrainedRepresentation;
let TRAINED_FEATURE_ORDER_15DIM;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "elara-preprocessing-test-"));
  // DB_PATH is resolved by database/db.js relative to backend/ (__dirname
  // here is backend/tests, so ".." is backend/) -- see tests/helpers/testServer.js
  // for the same convention.
  process.env.DB_PATH = path.relative(
    path.join(__dirname, ".."),
    path.join(tmpDir, "test.db")
  );

  const { db } = require("../database/db");
  const migrationsDir = path.join(__dirname, "..", "database", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  // Seed reference data + scaler params, mirroring
  // backend/database/seedTrainingReferenceData.js against this isolated DB.
  const { run, transaction } = require("../database/db");

  const rows = fs
    .readFileSync(TRIMMED_CSV_PATH, "utf8")
    .trim()
    .split(/\r?\n/);
  const header = rows[0].split(",");
  const dataRows = rows.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    header.forEach((col, i) => (row[col] = values[i]));
    return row;
  });

  transaction(() => {
    for (const row of dataRows) {
      run(
        `INSERT INTO training_reference_data (
          thalach, restecg, oldpeak, slope, age, sex, cp, exang, trestbps, fbs, target, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uci_reference')`,
        [
          Number(row.thalach), Number(row.restecg), Number(row.oldpeak), Number(row.slope),
          Number(row.age), Number(row.sex), Number(row.cp), Number(row.exang),
          Number(row.trestbps), Number(row.fbs), Number(row.target),
        ]
      );
    }
  });

  const artifact = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "..", "..", "models", "rl", "preprocessing_params.json"),
      "utf8"
    )
  );
  transaction(() => {
    for (const [featureName, stats] of Object.entries(artifact.scaler.columns)) {
      run(
        `INSERT INTO preprocessing_scaler_params (feature_name, median, q1, q3, iqr, fitted_on_row_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [featureName, stats.median, stats.q1, stats.q3, stats.iqr, artifact.row_count]
      );
    }
  });

  ({ toTrainedRepresentation, TRAINED_FEATURE_ORDER_15DIM } = require("../services/preprocessingService"));
});

after(() => {
  try {
    const { db } = require("../database/db");
    db.close();
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // ignore -- OS will clean up eventually
  }
});

function parseCsv(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row = {};
    header.forEach((col, i) => (row[col] = values[i]));
    return row;
  });
}

let trimmedRows;
let originalRows;

before(() => {
  if (!fs.existsSync(TRIMMED_CSV_PATH) || !fs.existsSync(ORIGINAL_PREPROCESSED_CSV_PATH)) {
    throw new Error(
      "Required CSVs not found. Run research/preprocessing/feature_selection.py and " +
        "ensure the original preprocessed_dataset_2026-07-04_07-18-06.csv is present."
    );
  }
  trimmedRows = parseCsv(TRIMMED_CSV_PATH);
  originalRows = parseCsv(ORIGINAL_PREPROCESSED_CSV_PATH);
});

test("toTrainedRepresentation reproduces the original preprocessed dataset exactly", () => {
  assert.equal(trimmedRows.length, originalRows.length);
  assert.equal(trimmedRows.length, 539);

  let maxAbsDiff = 0;

  for (let i = 0; i < trimmedRows.length; i++) {
    const raw = trimmedRows[i];
    const expected = originalRows[i];

    const features = {
      thalach: Number(raw.thalach),
      restecg: Number(raw.restecg),
      oldpeak: Number(raw.oldpeak),
      slope: Number(raw.slope),
      age: Number(raw.age),
      sex: Number(raw.sex),
      cp: Number(raw.cp),
      exang: Number(raw.exang),
      trestbps: Number(raw.trestbps),
      fbs: Number(raw.fbs),
    };

    const actual = toTrainedRepresentation(features);

    // The original CSV's header uses the source dataset's spelling "thalch"
    // (no 'a'), not the canonical "thalach" used everywhere else in this
    // project -- see research/preprocessing/feature_selection.py.
    const EXPECTED_COLUMN_NAME = { thalach: "thalch" };

    TRAINED_FEATURE_ORDER_15DIM.forEach((colName, idx) => {
      const lookupName = EXPECTED_COLUMN_NAME[colName] || colName;
      const expectedValue = Number(expected[lookupName]);
      const diff = Math.abs(actual[idx] - expectedValue);
      maxAbsDiff = Math.max(maxAbsDiff, diff);

      assert.ok(
        diff < 1e-9,
        `Row ${i}, column '${colName}': expected ${expectedValue}, got ${actual[idx]} (diff ${diff})`
      );
    });
  }

  console.log(`Max absolute difference across all 539 rows x 15 columns: ${maxAbsDiff}`);
});

test("throws a clear error for an unrecognized cp value", () => {
  assert.throws(
    () =>
      toTrainedRepresentation({
        thalach: 150, restecg: 0, oldpeak: 1, slope: 1, age: 50,
        sex: 1, cp: 99, exang: 0, trestbps: 120, fbs: 0,
      }),
    /Unrecognized cp value/
  );
});
