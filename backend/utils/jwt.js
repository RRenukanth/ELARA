const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

if (!JWT_SECRET) {
  // Fail fast rather than silently signing tokens with `undefined`.
  throw new Error(
    "JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set a real secret."
  );
}

/**
 * Sign a JWT for an authenticated principal.
 * @param {{id: number, role: 'patient'|'doctor'|'admin', username: string}} payload
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT. Throws on invalid/expired token.
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
