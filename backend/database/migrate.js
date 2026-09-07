// Simple, dependency-free migration runner for SQLite.
//
// Applies every .sql file in database/migrations/ in filename order,
// tracking applied migrations in a `_migrations` table so re-running
// this script is a no-op for already-applied files.
//
// Usage: npm run migrate   (from backend/)

const fs = require("fs");
const path = require("path");
const { db } = require("./db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function ensureMigrationsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
}

function getAppliedMigrations() {
  const stmt = db.prepare("SELECT filename FROM _migrations");
  return new Set(stmt.all().map((row) => row.filename));
}

function runMigrations() {
  ensureMigrationsTable();
  const applied = getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (filename) VALUES (?)").run(file);
      db.exec("COMMIT");
      console.log(`Applied migration: ${file}`);
      appliedCount += 1;
    } catch (err) {
      db.exec("ROLLBACK");
      console.error(`Failed to apply migration ${file}:`, err.message);
      process.exit(1);
    }
  }

  if (appliedCount === 0) {
    console.log("No new migrations to apply.");
  } else {
    console.log(`Applied ${appliedCount} migration(s) successfully.`);
  }
}

runMigrations();
