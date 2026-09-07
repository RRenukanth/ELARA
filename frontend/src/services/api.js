// Thin fetch wrapper for the ELARA backend API.
// Attaches the JWT (if present) and normalizes error handling so callers
// can just `await` and catch a single Error type with a useful message.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const TOKEN_STORAGE_KEY = "elara_token";

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}.`);
  }

  return data;
}

export const api = {
  // ---- Auth ----
  registerPatient: (payload) => request("/auth/register/patient", { method: "POST", body: payload, auth: false }),
  registerDoctor: (payload) => request("/auth/register/doctor", { method: "POST", body: payload, auth: false }),
  loginPatient: (payload) => request("/auth/login/patient", { method: "POST", body: payload, auth: false }),
  loginDoctor: (payload) => request("/auth/login/doctor", { method: "POST", body: payload, auth: false }),
  loginAdmin: (payload) => request("/auth/login/admin", { method: "POST", body: payload, auth: false }),

  // ---- Patient ----
  getOwnPatientProfile: () => request("/patients/me"),
  getOwnHealthHistory: () => request("/patients/me/health-data"),

  // ---- Predictions ----
  // Model selection is not exposed to patients -- the app always uses PPO.
  createPrediction: (features) => request("/predictions", { method: "POST", body: features }),
  getPredictionHistory: () => request("/predictions/history"),
  getLatestPrediction: () => request("/predictions/latest"),

  // ---- Doctor ----
  getOwnDoctorProfile: () => request("/doctors/me"),
  getAssignedPatients: () => request("/doctors/me/patients"),
  getAssignedPatientProfile: (patientId) => request(`/doctors/me/patients/${patientId}`),
  getAssignedPatientPredictions: (patientId) => request(`/doctors/me/patients/${patientId}/predictions`),
  getIncomingConnectionRequests: () => request("/doctors/me/connection-requests"),
  acceptConnectionRequest: (requestId) =>
    request(`/doctors/me/connection-requests/${requestId}/accept`, { method: "POST" }),
  declineConnectionRequest: (requestId) =>
    request(`/doctors/me/connection-requests/${requestId}/decline`, { method: "POST" }),

  // ---- Patient <-> Doctor connections ----
  getMyDoctors: () => request("/patients/me/doctors"),
  getAvailableDoctors: () => request("/patients/me/doctors/available"),
  getOwnConnectionRequests: () => request("/patients/me/connection-requests"),
  sendConnectionRequest: (doctorId) =>
    request("/patients/me/connection-requests", { method: "POST", body: { doctorId } }),
  cancelConnectionRequest: (requestId) =>
    request(`/patients/me/connection-requests/${requestId}/cancel`, { method: "POST" }),

  // ---- Admin ----
  getPendingDoctors: () => request("/admin/doctors/pending"),
  approveDoctor: (doctorId) => request(`/admin/doctors/${doctorId}/approve`, { method: "POST" }),
  rejectDoctor: (doctorId) => request(`/admin/doctors/${doctorId}/reject`, { method: "POST" }),
  assignPatientToDoctor: (doctorId, patientId) =>
    request(`/admin/doctors/${doctorId}/assign-patient`, { method: "POST", body: { patientId } }),
  // HRFLM global model-behavior explanation -- admin-only.
  getHrflmGlobalExplanation: () => request("/admin/hrflm/global-explanation"),

  // ---- IoT ----
  registerDevice: (payload) => request("/iot/devices", { method: "POST", body: payload }),
  listDevices: () => request("/iot/devices"),
};

export { API_BASE_URL };
