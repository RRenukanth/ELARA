-- ELARA Backend - Doctor <-> Patient Connection Requests (SQLite)
--
-- Implements a request/accept workflow (patient sends a connection request,
-- doctor accepts or declines) as the PRIMARY way a doctor_patient_assignments
-- row gets created, replacing "admin manually pairs every patient with every
-- doctor" as the everyday path. The admin-direct-assign endpoint
-- (POST /api/admin/doctors/:doctorId/assign-patient) is KEPT as an override
-- path for support/correction cases -- both paths write into the same
-- doctor_patient_assignments table, so the access-control enforcement in
-- doctorModel.isPatientAssignedToDoctor() does not need to change.
--
-- Only a doctor with approval_status = 'approved' can be requested (enforced
-- in application code, not by a DB constraint, since that status can change
-- over time independently of existing requests).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS doctor_patient_requests (
    request_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id            INTEGER NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
    doctor_id             INTEGER NOT NULL REFERENCES doctors(doctor_id) ON DELETE CASCADE,

    -- 'pending'   -- awaiting the doctor's response
    -- 'accepted'  -- doctor accepted; a doctor_patient_assignments row was created at the same time
    -- 'declined'  -- doctor declined
    -- 'cancelled' -- patient withdrew the request before the doctor responded
    status                TEXT NOT NULL DEFAULT 'pending'
                              CHECK(status IN ('pending', 'accepted', 'declined', 'cancelled')),

    requested_at          TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    responded_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_patient ON doctor_patient_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_requests_doctor ON doctor_patient_requests(doctor_id);

-- A patient may only have ONE pending request to a given doctor at a time
-- (they can send a new one later if this one is cancelled/declined/accepted --
-- this partial unique index only restricts concurrent PENDING duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS idx_requests_unique_pending
    ON doctor_patient_requests(patient_id, doctor_id)
    WHERE status = 'pending';
