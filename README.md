# ELARA - Explainable Reinforcement Learning and IoT for Optimal Heart Disease Prediction

ELARA is a research-oriented, explainable heart disease risk-prediction system.
It combines a reinforcement-learning research pipeline, local/global
explainability (LIME + HRFLM), IoT-based health data acquisition, and a
full-stack web application for patients, doctors, and administrators.

**This is a decision-support and research system. It does not provide a
medical diagnosis.** Every prediction shown to a user is labeled as a
model-based risk assessment, with guidance to consult a qualified
healthcare professional.

## Project structure

```text
ELARA/
├── research/            Python/Jupyter research pipeline (Google Colab)
│   ├── data/             Raw + balanced datasets
│   ├── preprocessing/    Dataset balancing, RL problem formulation, cross-validation folds
│   ├── reinforcement_learning/  DQN, PPO, Q-Learning training notebooks
│   ├── explainability/   LIME notebook (HRFLM notebook not yet created)
│   ├── evaluation/       (planned) five-fold evaluation, model comparison
│   └── cli/              (planned) CLI validation harness
│
├── models/               Exported research artifacts consumed by the backend
│   ├── rl/                Trained RL model weights (PPO/DQN/Q-Learning) + metadata.json + preprocessing_params.json
│   ├── lime/               (LIME runs live against the deployed model at request time -- see backend/services/limeExplainerService.js -- this folder is not used for LIME artifacts)
│   └── hrflm/              HRFLM global-explainability artifacts (not yet implemented)
│
├── backend/              Node.js + Express + SQLite REST API
│   ├── controllers/        Request handlers (auth, patient, doctor, admin, prediction, iot)
│   ├── routes/             Express routers, mounted under /api/*
│   ├── services/           modelService.js (multi-algorithm model loading/selection), limeExplainerService.js (real LIME), limeService.js (presentation layer), adapters/ (onnx + q-table loaders)
│   ├── models/             Data-access layer (parameterized SQL, one module per table)
│   ├── middleware/          JWT auth + role-based authorization, centralized error handler
│   ├── database/            migrations/001-003, migrate.js, db.js (node:sqlite wrapper), seedTrainingReferenceData.js
│   ├── utils/                featureContract.js (canonical 10-feature order/validation), validators.js, jwt.js, prng.js (seedable RNG for LIME)
│   └── tests/                node --test suite (auth, patient isolation, prediction, model adapters, LIME explainer, model selection)
│
├── frontend/             React + Vite + Tailwind CSS (neon-purple theme)
│   ├── src/pages/auth/       Login, patient/doctor registration, forgot password
│   ├── src/pages/patient/    Prediction form with model selector, prediction history with LIME charts
│   ├── src/pages/doctor/     Assigned-patients list, patient detail + LIME explanation
│   ├── src/pages/admin/      Doctor approval workflow
│   ├── src/components/       Shared UI (RiskBadge, Alert, MedicalDisclaimer, PredictionForm, ModelSelector, FeatureContributionChart, ...)
│   ├── src/layouts/           DashboardLayout (role-aware navigation)
│   └── src/services/api.js    Fetch wrapper for the backend API
│
├── iot/                  ESP32 firmware scaffold + device communication contract
│   ├── firmware/            elara_device.ino (unvalidated scaffold), config.h.example
│   └── communication/       device-protocol.md, feature-mapping.md
│
├── docs/                 Legacy schema/documentation and design references (historical)
└── archive/              Archived legacy backend/frontend code and old prototypes (preserved, not deleted)
```

## The ten canonical model features

Every part of this system (backend validation, LIME, IoT ingest, the
frontend prediction form) uses the same ten features in the same order.
See `backend/utils/featureContract.js` for the authoritative definition:

`thalach`, `restecg`, `oldpeak`, `slope`, `age`, `sex`, `cp`, `exang`, `trestbps`, `fbs`

## Trained models

`models/rl/` contains real, trained model artifacts for all three RL
algorithms, produced by running the research notebooks in Google Colab:
`ppo-fold4-2026-08-13/`, `dqn-fold5-2026-08-13/`, and
`qlearning-2026-08-13/`. Each folder has a `metadata.json` describing its
feature order, preprocessing, training/evaluation metadata, and runtime
compatibility info. The backend defaults to PPO for all predictions (model
selection by the client is intentionally disabled; see
`backend/controllers/predictionController.js`), while DQN and Q-Learning
remain fully loadable via `modelService.predict(features, { algorithm })`
if re-enabled later.

The **preprocessing** side (converting the 10 raw canonical features into
the 15-dimension representation the RL models train on) is handled by
`backend/services/preprocessingService.js`, verified byte-for-byte against
the original research preprocessing output.

The **model-loading** side handles three incompatible Python-only formats
(DQN/PPO PyTorch `.pth`, Q-Learning `.pkl`) that Node.js cannot read
directly: each notebook exports an additional Node-loadable copy alongside
its native checkpoint (`model.onnx` for DQN/PPO via `onnxruntime-node`,
`model.json` for Q-Learning). `backend/services/modelService.js` picks
whichever adapter `metadata.json` declares and exposes one common
`predict()` interface regardless of algorithm -- see `models/README.md`
("Common loading framework") for details.

## Getting started

### Prerequisites

- Node.js >= 22.5.0 (this project uses the built-in `node:sqlite` module,
  which is experimental but functional; you will see an
  `ExperimentalWarning` on startup -- this is expected)
- npm

### Backend

```bash
cd backend
npm install
copy .env.example .env      # Windows (or `cp .env.example .env` on macOS/Linux)
# Edit .env and set a real JWT_SECRET before anything beyond local dev.
npm run migrate               # applies backend/database/migrations/*.sql
node database/seedTrainingReferenceData.js   # loads reference data + scaler params (see models/README.md)
npm run dev                    # starts the API on http://localhost:5000
```

Run the backend test suite:

```bash
cd backend
npm test
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env.local   # Windows (or `cp .env.example .env.local`)
npm run dev                      # starts Vite on http://localhost:5173
```

The frontend expects `VITE_API_BASE_URL` (default
`http://localhost:5000/api`) to point at a running backend.

### Creating an administrator account

There is intentionally no public admin-registration endpoint (admins must
not be self-service, for security reasons). For local development,
insert one directly:

```bash
cd backend
node -e "
const bcrypt = require('bcrypt');
const { run } = require('./database/db');
bcrypt.hash('your-admin-password', 10).then(hash => {
  run('INSERT INTO admins (username, password_hash, first_name, last_name, email) VALUES (?, ?, ?, ?, ?)',
    ['admin', hash, 'Admin', 'User', 'admin@example.com']);
});
"
```

In a real deployment, this should be replaced with a proper seeding/ops
process, not exposed as an application feature.

## Security notes

- Passwords are hashed with bcrypt; plaintext passwords are never stored.
- Authentication uses JWTs; every protected route re-verifies the token and
  authorization server-side (frontend route guards are a UX convenience
  only, not a security boundary).
- Patient identity for all patient-scoped operations is derived from the
  authenticated JWT, never from client-supplied IDs.
- Doctors can only access patients explicitly assigned to them via the
  `doctor_patient_assignments` table.
- IoT devices authenticate with a per-device identifier + key (hashed at
  rest), separate from any patient login session.

## Reproducibility and research pipeline

The research pipeline (`research/`) is intended to run in Google Colab and
export versioned artifacts into `models/` for the application to consume.
See `models/README.md` for the exact artifact contract (feature order,
preprocessing metadata, evaluation metadata) each export must satisfy.

## Legacy code and history

Earlier, incomplete implementations from this project's history are
preserved (not deleted) under `archive/` and `docs/legacy-schema/` for
reference, per the project's "no silent deletion of research artifacts"
principle. The current `backend/` and `frontend/` are a rebuild that fixes
known bugs in that legacy code (a broken route-file require path, a
hardcoded MySQL dependency, and client-side-only validation with no real
API wiring) while following the project's established folder structure
and security requirements.
