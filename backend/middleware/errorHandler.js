// Centralized error handler. Keep messages generic for unexpected errors so
// internal details are not leaked to clients; log full details server-side
// only (and never log request bodies, which may contain passwords/tokens).

function notFoundHandler(req, res) {
  res.status(404).json({ message: "Resource not found." });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.statusCode || 500;

  console.error(`[error] ${req.method} ${req.path} -> ${err.message}`);

  if (status >= 500) {
    return res.status(500).json({ message: "Internal server error." });
  }

  return res.status(status).json({ message: err.message || "Request failed." });
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { notFoundHandler, errorHandler, HttpError };
