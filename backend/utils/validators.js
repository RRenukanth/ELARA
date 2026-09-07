// Shared input validation helpers.
// Keep these dependency-free (no external validation library) to match the
// project's minimal-dependency approach; add a library only if validation
// requirements grow significantly more complex.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9]{7,15}$/;

function isNonEmptyString(value, maxLength = 255) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_PATTERN.test(value) && value.length <= 255;
}

function isValidPhone(value) {
  return typeof value === "string" && PHONE_PATTERN.test(value.trim());
}

function isValidPassword(value) {
  // Minimum requirement mirrors the legacy frontend's rule; enforced here
  // server-side since frontend validation alone is not trustworthy.
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function isValidAge(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 120;
}

function isValidSex(value) {
  return ["Male", "Female", "Other"].includes(value);
}

function isValidUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.]{3,50}$/.test(value);
}

module.exports = {
  isNonEmptyString,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidAge,
  isValidSex,
  isValidUsername,
};
