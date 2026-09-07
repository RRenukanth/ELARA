const { verifyToken } = require("../utils/jwt");

/**
 * Authenticate a request using a Bearer JWT.
 * Attaches req.user = { id, role, username } derived ONLY from the verified
 * token -- never from client-supplied body/query/params. This is required
 * by security-and-privacy.md: patient/doctor identity must be derived from
 * the authenticated session, not trusted client input.
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, role: decoded.role, username: decoded.username };
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

/**
 * Restrict a route to one or more roles. Must run after `authenticate`.
 * @param  {...('patient'|'doctor'|'admin')} allowedRoles
 */
function authorize(...allowedRoles) {
  return function authorizeRole(req, res, next) {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action." });
    }

    return next();
  };
}

module.exports = { authenticate, authorize };
