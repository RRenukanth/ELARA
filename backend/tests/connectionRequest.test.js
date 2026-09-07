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

async function registerPatient(username, email) {
  await fetch(`${ctx.baseUrl()}/api/auth/register/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username, password: "password123", firstName: "Pat", lastName: "Ient",
      email, age: 40, sex: "Male",
    }),
  });
  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  const body = await loginRes.json();
  return { token: body.token, patientId: body.profile.patientId };
}

async function registerAndApproveDoctor(username, email) {
  await fetch(`${ctx.baseUrl()}/api/auth/register/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username, password: "password123", firstName: "Doc", lastName: "Tor",
      email, hospitalName: "Test Hospital", specialization: "Cardiology",
      registrationNumber: `REG-${username}`,
    }),
  });

  const { run } = require("../database/db");
  await bcrypt.hash("adminpass123", 4); // warm bcrypt module (not strictly needed)

  const doctorRow = require("../models/doctorModel").findByUsername(username);
  run("UPDATE doctors SET approval_status = 'approved' WHERE doctor_id = ?", [doctorRow.doctor_id]);

  const loginRes = await fetch(`${ctx.baseUrl()}/api/auth/login/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" }),
  });
  const body = await loginRes.json();
  return { token: body.token, doctorId: body.profile.doctorId };
}

test("a patient can see an approved doctor in the available-doctors list", async () => {
  const patient = await registerPatient("cr_patient1", "cr_patient1@example.com");
  const doctor = await registerAndApproveDoctor("cr_doctor1", "cr_doctor1@example.com");

  const res = await fetch(`${ctx.baseUrl()}/api/patients/me/doctors/available`, {
    headers: { Authorization: `Bearer ${patient.token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.doctors.some((d) => d.doctorId === doctor.doctorId));
});

test("full request -> accept flow creates an assignment and grants doctor access", async () => {
  const patient = await registerPatient("cr_patient2", "cr_patient2@example.com");
  const doctor = await registerAndApproveDoctor("cr_doctor2", "cr_doctor2@example.com");

  // Doctor cannot see the patient yet.
  const beforeRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/patients/${patient.patientId}`, {
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  assert.equal(beforeRes.status, 403);

  // Patient sends a request.
  const sendRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctor.doctorId }),
  });
  assert.equal(sendRes.status, 201);
  const sendBody = await sendRes.json();
  const requestId = sendBody.request.requestId;
  assert.equal(sendBody.request.status, "pending");

  // Doctor sees it in their incoming queue.
  const incomingRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/connection-requests`, {
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  const incomingBody = await incomingRes.json();
  assert.equal(incomingBody.requests.length, 1);
  assert.equal(incomingBody.requests[0].requestId, requestId);

  // Doctor accepts.
  const acceptRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/connection-requests/${requestId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  assert.equal(acceptRes.status, 200);

  // Doctor can now see the patient.
  const afterRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/patients/${patient.patientId}`, {
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  assert.equal(afterRes.status, 200);

  // Patient's own request list reflects the accepted status.
  const myRequestsRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    headers: { Authorization: `Bearer ${patient.token}` },
  });
  const myRequestsBody = await myRequestsRes.json();
  assert.equal(myRequestsBody.requests[0].status, "accepted");

  // The doctor now appears in the patient's "My Doctors" list.
  const myDoctorsRes = await fetch(`${ctx.baseUrl()}/api/patients/me/doctors`, {
    headers: { Authorization: `Bearer ${patient.token}` },
  });
  const myDoctorsBody = await myDoctorsRes.json();
  assert.ok(myDoctorsBody.doctors.some((d) => d.doctorId === doctor.doctorId));
});

test("a doctor can decline a request without creating an assignment", async () => {
  const patient = await registerPatient("cr_patient3", "cr_patient3@example.com");
  const doctor = await registerAndApproveDoctor("cr_doctor3", "cr_doctor3@example.com");

  const sendRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctor.doctorId }),
  });
  const { request } = await sendRes.json();

  const declineRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/connection-requests/${request.requestId}/decline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  assert.equal(declineRes.status, 200);

  const checkRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/patients/${patient.patientId}`, {
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  assert.equal(checkRes.status, 403);
});

test("a patient cannot send a second pending request to the same doctor", async () => {
  const patient = await registerPatient("cr_patient4", "cr_patient4@example.com");
  const doctor = await registerAndApproveDoctor("cr_doctor4", "cr_doctor4@example.com");

  const firstRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctor.doctorId }),
  });
  assert.equal(firstRes.status, 201);

  const secondRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctor.doctorId }),
  });
  assert.equal(secondRes.status, 409);
});

test("a patient can cancel their own pending request", async () => {
  const patient = await registerPatient("cr_patient5", "cr_patient5@example.com");
  const doctor = await registerAndApproveDoctor("cr_doctor5", "cr_doctor5@example.com");

  const sendRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctor.doctorId }),
  });
  const { request } = await sendRes.json();

  const cancelRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests/${request.requestId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${patient.token}` },
  });
  assert.equal(cancelRes.status, 200);

  const incomingRes = await fetch(`${ctx.baseUrl()}/api/doctors/me/connection-requests`, {
    headers: { Authorization: `Bearer ${doctor.token}` },
  });
  const incomingBody = await incomingRes.json();
  assert.equal(incomingBody.requests.length, 0);
});

test("a patient cannot request a doctor who is not yet approved", async () => {
  const patient = await registerPatient("cr_patient6", "cr_patient6@example.com");

  await fetch(`${ctx.baseUrl()}/api/auth/register/doctor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "cr_doctor6_unapproved", password: "password123", firstName: "Doc", lastName: "Tor",
      email: "cr_doctor6@example.com", hospitalName: "Test Hospital", specialization: "Cardiology",
      registrationNumber: "REG-cr_doctor6",
    }),
  });
  const unapprovedDoctor = require("../models/doctorModel").findByUsername("cr_doctor6_unapproved");

  const res = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: unapprovedDoctor.doctor_id }),
  });
  assert.equal(res.status, 404);
});

test("one doctor cannot accept another doctor's request", async () => {
  const patient = await registerPatient("cr_patient7", "cr_patient7@example.com");
  const doctorA = await registerAndApproveDoctor("cr_doctor7a", "cr_doctor7a@example.com");
  const doctorB = await registerAndApproveDoctor("cr_doctor7b", "cr_doctor7b@example.com");

  const sendRes = await fetch(`${ctx.baseUrl()}/api/patients/me/connection-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patient.token}` },
    body: JSON.stringify({ doctorId: doctorA.doctorId }),
  });
  const { request } = await sendRes.json();

  const res = await fetch(`${ctx.baseUrl()}/api/doctors/me/connection-requests/${request.requestId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${doctorB.token}` },
  });
  assert.equal(res.status, 404);
});
