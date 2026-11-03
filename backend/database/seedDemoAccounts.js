const bcrypt = require("bcrypt");
const { get, run, transaction } = require("./db");

const SALT_ROUNDS = 10;

async function seedDemoAccounts() {
  const adminHash = await bcrypt.hash("adminpassword123", SALT_ROUNDS);
  const patientHash = await bcrypt.hash("patientpassword123", SALT_ROUNDS);
  const doctorHash = await bcrypt.hash("doctorpassword123", SALT_ROUNDS);

  transaction(() => {
    // Admin
    const existingAdmin = get("SELECT admin_id FROM admins WHERE username = ?", ["admin"]);
    if (!existingAdmin) {
      run(
        `INSERT INTO admins (username, password_hash, first_name, last_name, email)
         VALUES (?, ?, ?, ?, ?)`,
        ["admin", adminHash, "Admin", "User", "admin@example.com"]
      );
      console.log("Created admin account: admin / adminpassword123");
    } else {
      run("UPDATE admins SET password_hash = ? WHERE username = ?", [adminHash, "admin"]);
      console.log("Updated admin account password: admin / adminpassword123");
    }

    // Patient
    const existingPatient = get("SELECT patient_id FROM patients WHERE username = ?", ["testpatient"]);
    if (!existingPatient) {
      run(
        `INSERT INTO patients (username, password_hash, first_name, last_name, email, age, sex, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
        ["testpatient", patientHash, "John", "Doe", "john.doe@example.com", 52, "Male"]
      );
      console.log("Created patient account: testpatient / patientpassword123");
    } else {
      run("UPDATE patients SET password_hash = ?, status = 'Active' WHERE username = ?", [
        patientHash,
        "testpatient",
      ]);
      console.log("Updated patient account password: testpatient / patientpassword123");
    }

    // Doctor
    const existingDoctor = get("SELECT doctor_id FROM doctors WHERE username = ?", ["drsmith"]);
    if (!existingDoctor) {
      run(
        `INSERT INTO doctors (
          username, password_hash, first_name, last_name, email, age, sex,
          hospital_name, specialization, registration_number, years_experience, approval_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [
          "drsmith",
          doctorHash,
          "Sarah",
          "Smith",
          "drsmith@example.com",
          45,
          "Female",
          "Central Cardiology Clinic",
          "Cardiology",
          "MED-84920",
          15,
        ]
      );
      console.log("Created approved doctor account: drsmith / doctorpassword123");
    } else {
      run(
        "UPDATE doctors SET password_hash = ?, approval_status = 'approved' WHERE username = ?",
        [doctorHash, "drsmith"]
      );
      console.log("Updated doctor account password & approval: drsmith / doctorpassword123");
    }
  });

  console.log("Demo accounts seeded successfully.");
}

seedDemoAccounts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed demo accounts:", err);
    process.exit(1);
  });
