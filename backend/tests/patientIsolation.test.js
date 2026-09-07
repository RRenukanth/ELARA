const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testServer");

let ctx;

async function registerAndLoginPatient(username, email) {
  await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: "password123",
      firstName: "First",
      lastName: "Last",
      email,
      age: 40,
      sex: "Male",
    }),
  });

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  const { token } = await loginRes.json();
  return token;
}

const SAMPLE_FEATURES = {
  thalach: 110,
  restecg: 1,
  oldpeak: 2.1,
  slope: 0,
  age: 58,
  sex: 1,
  cp: 3,
  exang: 1,
  trestbps: 150,
  fbs: 1,
};

before(() => {
  ctx = createTestContext();
});

after(() => {
  ctx.close();
});

test("a patient cannot see another patient's prediction history", async () => {
  const tokenA = await registerAndLoginPatient("iso_patient_a", "iso_a@example.com");
  const tokenB = await registerAndLoginPatient("iso_patient_b", "iso_b@example.com");

  // Patient A creates a prediction.
  const createRes = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify(SAMPLE_FEATURES),
  });
  assert.equal(createRes.status, 201);

  // Patient A sees their own prediction.
  const historyA = await fetch(`${ctx.baseUrl()}/api/predictions/history`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const bodyA = await historyA.json();
  assert.equal(bodyA.predictions.length, 1);

  // Patient B must see an empty history, not patient A's data.
  const historyB = await fetch(`${ctx.baseUrl()}/api/predictions/history`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const bodyB = await historyB.json();
  assert.equal(bodyB.predictions.length, 0);
});

test("patient identity for predictions is derived from the JWT, not the request body", async () => {
  const tokenA = await registerAndLoginPatient("iso_patient_c", "iso_c@example.com");
  const tokenB = await registerAndLoginPatient("iso_patient_d", "iso_d@example.com");

  // Attempt to spoof another patient's identity via the body; the backend
  // must ignore this and use the JWT-derived id instead.
  await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ ...SAMPLE_FEATURES, patientId: 999999 }),
  });

  const historyB = await fetch(`${ctx.baseUrl()}/api/predictions/history`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const bodyB = await historyB.json();
  assert.equal(bodyB.predictions.length, 0, "spoofed patientId in body must not leak data to another patient");
});

test("a doctor cannot view a patient who is not assigned to them", async () => {
  await registerAndLoginPatient("iso_patient_e", "iso_e@example.com");

  await fetch(`${ctx.baseUrl()}/api/auth/register/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "iso_doctor1",
      password: "password123",
      firstName: "Doc",
      lastName: "One",
      email: "iso_doctor1@example.com",
      hospitalName: "Test Hospital",
      specialization: "Cardiology",
      registrationNumber: "REG-ISO-1",
    }),
  });

  // Approve the doctor directly via the admin flow requires an admin account,
  // which has no public registration endpoint by design. Insert one directly
  // through the db module for this test only.
  const bcrypt = require("bcrypt");
  const { run } = require("../database/db");
  const passwordHash = await bcrypt.hash("adminpass123", 4);
  run(
    "INSERT INTO admins (username, password_hash, first_name, last_name, email) VALUES (?, ?, ?, ?, ?)",
    ["iso_admin1", passwordHash, "Admin", "One", "iso_admin1@example.com"]
  );

  const adminLogin = await fetch(`${ctx.baseUrl()}/api/auth/login/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "iso_admin1", password: "adminpass123" }),
  });
  const { token: adminToken } = await adminLogin.json();

  const pending = await fetch(`${ctx.baseUrl()}/api/admin/doctors/pending`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const { doctors } = await pending.json();
  const doctorId = doctors.find((d) => d.username === "iso_doctor1").doctorId;

  await fetch(`${ctx.baseUrl()}/api/admin/doctors/${doctorId}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  const doctorLogin = await fetch(`${ctx.baseUrl()}/api/auth/login/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "iso_doctor1", password: "password123" }),
  });
  const { token: doctorToken } = await doctorLogin.json();

  // The patient exists but was never assigned to this doctor.
  const res = await fetch(`${ctx.baseUrl()}/api/doctors/me/patients/1`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  assert.equal(res.status, 403);
});
