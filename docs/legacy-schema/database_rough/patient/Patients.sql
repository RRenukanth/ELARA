CREATE TABLE Patients(
    patient_id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,

    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,

    email VARCHAR(100) NOT NULL UNIQUE,

    age INT NOT NULL,
    sex ENUM('Male','Female') NOT NULL,

    phone_number VARCHAR(20),

    profile_picture VARCHAR(255),

    registration_date DATE NOT NULL,

    status ENUM('Active','Inactive')
    DEFAULT 'Active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);