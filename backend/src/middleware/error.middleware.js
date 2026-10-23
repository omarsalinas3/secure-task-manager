'use strict';

/**
 * Sends a consistent safe error response.
 *
 * @param {Error} error - Error forwarded by an earlier middleware.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} _next - Express continuation.
 * @returns {void}
 */
function errorHandler(error, req, res, _next) {
  req.log?.error({ err: error }, 'Request failed');

  if (res.headersSent) return;

  // body-parser errors are client errors, but their raw messages are never echoed.
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' } });
    return;
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const safeStatus = status >= 400 && status < 500 ? status : 500;

  res.status(safeStatus).json({
    error: {
      code: safeStatus === 500 ? 'INTERNAL_ERROR' : (error.code || 'REQUEST_ERROR'),
      message: safeStatus === 500 ? 'An unexpected error occurred.' : error.message,
    },
  });
}

/** Responds with a consistent 404 for unknown routes. */
function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}

module.exports = { errorHandler, notFoundHandler };
