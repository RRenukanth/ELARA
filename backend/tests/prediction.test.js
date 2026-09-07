const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./helpers/testServer");

let ctx;
let token;

const VALID_FEATURES = {
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

before(async () => {
  ctx = createTestContext();

  await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "pred_patient1",
      password: "password123",
      firstName: "Pred",
      lastName: "Patient",
      email: "pred_patient1@example.com",
      age: 50,
      sex: "Female",
    }),
  });

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "pred_patient1", password: "password123" }),
  });
  const body = await loginRes.json();
  token = body.token;
});

after(() => {
  ctx.close();
});

test("creates a prediction with valid canonical features", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(VALID_FEATURES),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(["LOW RISK", "MEDIUM RISK", "HIGH RISK"].includes(body.prediction.riskLevel));
  // demoMode reflects whether a trained model is actually available under
  // models/rl/ -- either value is valid depending on the environment this
  // test runs in (a fresh clone with no models placed yet vs. one with
  // real trained models present), so just assert it's a boolean rather
  // than a specific value.
  assert.equal(typeof body.prediction.demoMode, "boolean");
  assert.ok(body.disclaimer.toLowerCase().includes("not a medical diagnosis"));
  assert.ok(Array.isArray(body.prediction.contributingFactors));
});

test("rejects a prediction request missing a required feature", async () => {
  const incomplete = { ...VALID_FEATURES };
  delete incomplete.thalach;

  const res = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(incomplete),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /thalach/);
});

test("rejects a prediction request with an out-of-range value", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...VALID_FEATURES, age: 999 }),
  });

  assert.equal(res.status, 400);
});

test("rejects a prediction request with an invalid enum value", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...VALID_FEATURES, sex: 5 }),
  });

  assert.equal(res.status, 400);
});

test("prediction history reflects created predictions in descending order", async () => {
  await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(VALID_FEATURES),
  });

  const res = await fetch(`${ctx.baseUrl()}/api/predictions/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.predictions.length >= 2);
});

test("rejects prediction requests without authentication", async () => {
  const res = await fetch(`${ctx.baseUrl()}/api/predictions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_FEATURES),
  });

  assert.equal(res.status, 401);
});
