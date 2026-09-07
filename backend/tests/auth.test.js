const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testServer");

let ctx;

before(() => {
  ctx = createTestContext();
});

after(() => {
  ctx.close();
});

test("registers a new patient with valid data", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "auth_patient1",
      password: "password123",
      firstName: "Test",
      lastName: "Patient",
      email: "auth_patient1@example.com",
      age: 40,
      sex: "Male",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.patient.username, "auth_patient1");
  assert.equal(body.patient.email, "auth_patient1@example.com");
  // password hash must never be echoed back
  assert.equal(body.patient.passwordHash, undefined);
});

test("rejects patient registration with a weak password", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "auth_patient2",
      password: "short",
      firstName: "Test",
      lastName: "Patient",
      email: "auth_patient2@example.com",
      age: 40,
      sex: "Male",
    }),
  });

  assert.equal(res.status, 400);
});

test("rejects duplicate username registration", async () => {
  const payload = {
    username: "auth_dup_user",
    password: "password123",
    firstName: "Dup",
    lastName: "User",
    email: "auth_dup1@example.com",
    age: 30,
    sex: "Female",
  };

  const first = await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, email: "auth_dup2@example.com" }),
  });
  assert.equal(second.status, 409);
});

test("logs in with correct credentials and rejects wrong password", async () => {
  await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "auth_login_user",
      password: "password123",
      firstName: "Login",
      lastName: "User",
      email: "auth_login@example.com",
      age: 35,
      sex: "Male",
    }),
  });

  const goodLogin = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "auth_login_user", password: "password123" }),
  });
  assert.equal(goodLogin.status, 200);
  const goodBody = await goodLogin.json();
  assert.ok(goodBody.token);
  assert.equal(goodBody.role, "patient");

  const badLogin = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "auth_login_user", password: "wrongpassword" }),
  });
  assert.equal(badLogin.status, 401);
});

test("rejects requests to protected routes without a token", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/patients/me`);
  assert.equal(res.status, 401);
});

test("rejects requests with a malformed token", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/patients/me`, {
    headers: { Authorization: "Bearer not-a-real-token" },
  });
  assert.equal(res.status, 401);
});

test("doctor login is blocked until admin approval", async () => {
  await fetch(`${ctx.baseUrl()}/api/auth/register/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "auth_doc1",
      password: "password123",
      firstName: "Doc",
      lastName: "Tor",
      email: "auth_doc1@example.com",
      hospitalName: "Test Hospital",
      specialization: "Cardiology",
      registrationNumber: "REG1",
    }),
  });

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "auth_doc1", password: "password123" }),
  });

  assert.equal(loginRes.status, 403);
});
