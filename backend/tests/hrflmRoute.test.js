const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { createTestContext } = require("./helpers/testServer");

let ctx;

before(() => {
  ctx = createTestContext();
});

after(() => {
  ctx.close();
});

async function registerAndLoginPatient() {
  await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "hrflm_patient1",
      password: "password123",
      firstName: "Test",
      lastName: "Patient",
      email: "hrflm_patient1@example.com",
      age: 40,
      sex: "Male",
    }),
  });

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "hrflm_patient1", password: "password123" }),
  });
  const { token } = await loginRes.json();
  return token;
}

let adminSeeded = false;

async function seedAndLoginAdmin() {
  if (!adminSeeded) {
    const { run } = require("../database/db");
    const passwordHash = await bcrypt.hash("adminpass123", 4);
    run(
      "INSERT INTO admins (username, password_hash, first_name, last_name, email) VALUES (?, ?, ?, ?, ?)",
      ["hrflm_admin1", passwordHash, "Admin", "One", "hrflm_admin1@example.com"]
    );
    adminSeeded = true;
  }

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "hrflm_admin1", password: "adminpass123" }),
  });
  const { token } = await loginRes.json();
  return token;
}

test("rejects HRFLM global explanation requests without authentication", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/admin/hrflm/global-explanation`);
  assert.equal(res.status, 401);
});

test("rejects a patient from accessing the admin-only HRFLM global explanation", async () => {
  const patientToken = await registerAndLoginPatient();
  const res = await fetch(`${ctx.baseUrl()}/api/admin/hrflm/global-explanation`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert.equal(res.status, 403);
});

test("allows an admin to fetch the HRFLM global explanation", async () => {
  const adminToken = await seedAndLoginAdmin();
  const res = await fetch(`${ctx.baseUrl()}/api/admin/hrflm/global-explanation`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  // `available` depends on whether a real models/hrflm/<version>/ artifact
  // exists on disk in this environment -- assert the shape is always
  // correct rather than requiring a specific artifact to be present.
  assert.equal(typeof body.available, "boolean");
  if (body.available) {
    assert.ok(Array.isArray(body.globalFeatureImportance));
    assert.ok(body.globalFeatureImportance.length > 0);
    for (const entry of body.globalFeatureImportance) {
      assert.equal(typeof entry.feature, "string");
      assert.equal(typeof entry.hybridImportance, "number");
    }
  } else {
    assert.equal(typeof body.message, "string");
  }
});

test("HRFLM global explanation never includes patient-identifying fields", async () => {
  const adminToken = await seedAndLoginAdmin();
  const res = await fetch(`${ctx.baseUrl()}/api/admin/hrflm/global-explanation`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body = await res.json();
  const serialized = JSON.stringify(body).toLowerCase();

  for (const forbiddenField of ["patientid", "email", "phone", "firstname", "lastname", "address"]) {
    assert.ok(!serialized.includes(forbiddenField), `response must not contain '${forbiddenField}'`);
  }
});
