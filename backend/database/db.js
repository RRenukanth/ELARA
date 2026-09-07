// SQLite connection module.
//
// Uses Node's built-in `node:sqlite` (DatabaseSync) instead of a third-party
// native module (e.g. better-sqlite3). This avoids native-binary/prebuild
// compatibility issues across Node versions while still giving synchronous,
// transactional SQLite access suitable for this application's request volume.
//
// `node:sqlite` is experimental as of Node 22/24, but functionally stable
// for CRUD + transactions. If a future Node LTS removes/changes this API,
// swap this module only -- controllers/services depend on the methods
// exposed below, not on the underlying driver.

const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.resolve(__dirname, "elara.db");

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");

/**
 * Run a SELECT that returns multiple rows.
 * @param {string} sql
 * @param {Array} params
 */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.all(...params);
}

/**
 * Run a SELECT that returns a single row (or undefined).
 * @param {string} sql
 * @param {Array} params
 */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.get(...params);
}

/**
 * Run an INSERT/UPDATE/DELETE statement.
 * @param {string} sql
 * @param {Array} params
 * @returns {{changes: number, lastInsertRowid: number|bigint}}
 */
function run(sql, params = []) {
  const stmt = db.prepare(sql);
  return stmt.run(...params);
}

/**
 * Execute a function inside a transaction. Rolls back on thrown error.
 * @param {Function} fn
 */
function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

module.exports = { db, all, get, run, transaction, DB_PATH };
