'use strict';

/**
 * Creates an error carrying a safe HTTP status, code, and client message.
 *
 * @param {number} status - HTTP status code.
 * @param {string} code - Stable machine-readable error code.
 * @param {string} message - Safe message for clients.
 * @returns {Error} Error understood by the central error handler.
 */
function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/**
 * Wraps an async route handler and forwards failures to Express error handling.
 *
 * @param {Function} handler - Async Express route handler.
 * @returns {import('express').RequestHandler} Wrapped handler.
 */
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = { httpError, asyncRoute };
