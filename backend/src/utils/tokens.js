'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { env } = require('../config');

/**
 * Creates a short-lived signed access token for an authenticated user.
 *
 * @param {string} userId - Authenticated user's identifier.
 * @param {string} [sessionId] - Refresh-token family the token was issued for.
 * @returns {string} Signed access token.
 */
function createAccessToken(userId, sessionId) {
  const payload = { sub: userId, type: 'access' };
  if (sessionId) payload.sid = sessionId;
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '10m',
    issuer: 'task-manager-api',
    audience: 'task-manager-client',
  });
}

/**
 * Creates a cryptographically random opaque refresh token.
 *
 * @returns {string} Refresh token.
 */
function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Hashes a refresh token before it is stored or looked up.
 *
 * @param {string} token - Opaque refresh token.
 * @returns {string} SHA-256 digest encoded as hexadecimal.
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

module.exports = { createAccessToken, createRefreshToken, hashToken };
