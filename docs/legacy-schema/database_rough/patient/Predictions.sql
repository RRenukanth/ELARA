CREATE TABLE Predictions(
    prediction_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    health_id INT NOT NULL,

    risk_level ENUM('LOW RISK', 'MEDIUM RISK', 'HIGH RISK') NOT NULL,
    confidence_score DECIMAL(5,2) NOT NULL,
    patient_explanation TEXT,
    health_recommendation TEXT,
    doctor_recommendation TEXT,

    prediction_date DATE NOT NULL,
    prediction_time TIME NOT NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(patient_id)
    REFERENCES Patients(patient_id)
    ON DELETE CASCADE,

    FOREIGN KEY(health_id)
    REFERENCES Patient_Health_Data(health_id)
    ON DELETE CASCADE

);