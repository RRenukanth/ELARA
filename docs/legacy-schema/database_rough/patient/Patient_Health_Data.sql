CREATE TABLE Patient_Health_Data(
    health_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,

    thalach INT NOT NULL,
    restecg INT NOT NULL,
    oldpeak DECIMAL(5,2) NOT NULL,
    slope INT NOT NULL,
    cp INT NOT NULL,
    exang BOOLEAN NOT NULL,
    trestbps INT NOT NULL,
    fbs BOOLEAN NOT NULL,

    prediction_date DATE NOT NULL,
    prediction_time TIME NOT NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(patient_id)
    REFERENCES Patients(patient_id)
    ON DELETE CASCADE
);