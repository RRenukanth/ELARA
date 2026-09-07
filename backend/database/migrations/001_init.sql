-- ELARA Backend - Initial Schema (SQLite)
-- Converted from legacy MySQL schema (docs/legacy-schema/database_rough/patient/*.sql)
-- and expanded to cover patients, doctors, admins, health data,
-- predictions, and IoT devices.
--
-- Notes on conversion from MySQL -> SQLite:
--   AUTO_INCREMENT      -> INTEGER PRIMARY KEY AUTOINCREMENT
--   ENUM(...)           -> TEXT CHECK(col IN (...))
--   TIMESTAMP DEFAULT   -> TEXT DEFAULT (CURRENT_TIMESTAMP) (ISO-8601 UTC string)
--   BOOLEAN             -> INTEGER CHECK(col IN (0,1))

PRAGMA foreign_keys = ON;

-- =========================================================
-- PATIENTS
-- =========================================================
CREATE TABLE IF NOT EXISTS patients (
    patient_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    email                 TEXT NOT NULL UNIQUE,
    age                   INTEGER NOT NULL CHECK(age BETWEEN 0 AND 120),
    sex                   TEXT NOT NULL CHECK(sex IN ('Male','Female','Other')),
    phone_number          TEXT,
    emergency_contact     TEXT,
    profile_picture_path  TEXT,
    status                TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- =========================================================
-- DOCTORS
-- Doctors require administrator approval before login is permitted.
-- =========================================================
CREATE TABLE IF NOT EXISTS doctors (
    doctor_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    email                 TEXT NOT NULL UNIQUE,
    age                   INTEGER CHECK(age BETWEEN 0 AND 120),
    sex                   TEXT CHECK(sex IN ('Male','Female','Other')),
    phone_number          TEXT,
    hospital_name         TEXT,
    hospital_address      TEXT,
    specialization        TEXT,
    registration_number   TEXT,
    years_experience      INTEGER,
    license_document_path TEXT,
    nic_document_path     TEXT,
    profile_picture_path  TEXT,
    approval_status       TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected')),
    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- =========================================================
-- ADMINISTRATORS
-- =========================================================
CREATE TABLE IF NOT EXISTS admins (
    admin_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username              TEXT NOT NULL UNIQUE,
    password_hash         TEXT NOT NULL,
    first_name            TEXT NOT NULL,
    last_name             TEXT NOT NULL,
    email                 TEXT NOT NULL UNIQUE,
    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- =========================================================
-- DOCTOR <-> PATIENT ASSIGNMENTS
-- A doctor may only access patients that appear here (see security-and-privacy.md).
-- =========================================================
CREATE TABLE IF NOT EXISTS doctor_patient_assignments (
    assignment_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id             INTEGER NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,
    patient_id            INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    assigned_at           TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(doctor_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_doctor ON doctor_patient_assignments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_assignments_patient ON doctor_patient_assignments(patient_id);

-- =========================================================
-- HEALTH DATA
-- Snapshot of the ten canonical model features at the time of a
-- prediction request (see backend/utils/featureContract.js for order).
-- =========================================================
CREATE TABLE IF NOT EXISTS health_data (
    health_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id            INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,

    -- canonical 10 features, in canonical order
    thalach               INTEGER NOT NULL,
    restecg               INTEGER NOT NULL,
    oldpeak               REAL NOT NULL,
    slope                 INTEGER NOT NULL,
    age                   INTEGER NOT NULL,
    sex                   INTEGER NOT NULL CHECK(sex IN (0,1)),
    cp                    INTEGER NOT NULL,
    exang                 INTEGER NOT NULL CHECK(exang IN (0,1)),
    trestbps              INTEGER NOT NULL,
    fbs                   INTEGER NOT NULL CHECK(fbs IN (0,1)),

    source                TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','iot')),
    recorded_at           TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_health_data_patient ON health_data(patient_id);

-- =========================================================
-- PREDICTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS predictions (
    prediction_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id            INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    health_id             INTEGER NOT NULL REFERENCES health_data(health_id) ON DELETE CASCADE,

    model_version         TEXT NOT NULL,
    demo_mode             INTEGER NOT NULL DEFAULT 0 CHECK(demo_mode IN (0,1)),
    risk_level            TEXT NOT NULL CHECK(risk_level IN ('LOW RISK','MEDIUM RISK','HIGH RISK')),
    confidence_score      REAL NOT NULL,
    contributing_factors  TEXT,   -- JSON array, from LIME (local explanation)
    patient_explanation   TEXT,
    doctor_explanation    TEXT,

    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_predictions_patient ON predictions(patient_id);

-- =========================================================
-- IOT DEVICES
-- =========================================================
CREATE TABLE IF NOT EXISTS iot_devices (
    device_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id            INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    device_identifier     TEXT NOT NULL UNIQUE,
    device_key_hash       TEXT NOT NULL,
    device_type           TEXT NOT NULL DEFAULT 'ESP32',
    status                TEXT NOT NULL DEFAULT 'disconnected' CHECK(status IN ('connected','disconnected')),
    last_seen_at          TEXT,
    created_at            TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_iot_devices_patient ON iot_devices(patient_id);
