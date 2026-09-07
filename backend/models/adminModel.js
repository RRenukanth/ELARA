const { get, run } = require("../database/db");

function findByUsername(username) {
  return get("SELECT * FROM admins WHERE username = ?", [username]);
}

function findById(adminId) {
  return get("SELECT * FROM admins WHERE admin_id = ?", [adminId]);
}

function create(admin) {
  const result = run(
    `INSERT INTO admins (username, password_hash, first_name, last_name, email)
     VALUES (?, ?, ?, ?, ?)`,
    [admin.username, admin.passwordHash, admin.firstName, admin.lastName, admin.email]
  );
  return findById(Number(result.lastInsertRowid));
}

module.exports = { findByUsername, findById, create };
