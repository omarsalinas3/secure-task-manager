'use strict';

const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { prisma } = require('../repositories/task.repository');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/refresh-token.repository');
const { createAccessToken, createRefreshToken, hashToken } = require('../utils/tokens');
const { httpError } = require('../utils/http-error');
const audit = require('./audit.service');
const notifications = require('./notification.service');

const { AUDIT_ACTIONS } = audit;
const BCRYPT_COST = 12;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// A valid cost-12 hash of a random value: comparing against it keeps the response time of
// "unknown email" equal to "wrong password", which reduces account enumeration.
const DUMMY_PASSWORD_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.6Jp8G7Q5E5g5r5bQY7bYv7rFQ1wQ6eK';

/** Creates a safe authentication error with an HTTP status and code. */
function authError(message = 'Authentication required.') {
  return httpError(401, 'UNAUTHENTICATED', message);
}

/** Registers a user with a one-way password hash. */
async function register({ email, password, deviceName }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const user = await userRepository.create({ email, passwordHash });
    await audit.record(user.id, AUDIT_ACTIONS.REGISTER);
    return issueTokens(user.id, crypto.randomUUID(), prisma, deviceName);
  } catch (error) {
    if (error.code === 'P2002') {
      throw httpError(409, 'CONFLICT', 'An account with this email already exists.');
    }
    throw error;
  }
}

/** Authenticates credentials with a generic failure response. */
async function login({ email, password, deviceName }) {
  const user = await userRepository.findByEmail(email);
  const passwordHash = user?.passwordHash || DUMMY_PASSWORD_HASH;
  const matches = await bcrypt.compare(password, passwordHash);
  if (!user || !matches) {
    await audit.record(user?.id ?? null, AUDIT_ACTIONS.LOGIN, 'failure');
    throw authError('Invalid email or password.');
  }
  await audit.record(user.id, AUDIT_ACTIONS.LOGIN);
  notifications.notifyUser(user.id, {
    title: 'New sign-in',
    body: 'Your account was used to sign in on a device. If this was not you, change your password.',
  });
  return issueTokens(user.id, crypto.randomUUID(), prisma, deviceName);
}

/** Persists a new refresh-token hash and returns the raw token with its record. */
async function persistRefreshToken(userId, familyId, db, deviceName) {
  const refreshToken = createRefreshToken();
  const record = await tokenRepository.createToken({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId,
    deviceName: deviceName ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  }, db);
  return { refreshToken, record };
}

/** Issues an access/refresh pair and persists only the refresh-token hash. */
async function issueTokens(userId, familyId, db = prisma, deviceName = undefined) {
  const { refreshToken } = await persistRefreshToken(userId, familyId, db, deviceName);
  return { accessToken: createAccessToken(userId, familyId), refreshToken, expiresIn: 600 };
}

/** Rotates a refresh token transactionally and detects reuse of revoked tokens. */
async function refresh(refreshToken) {
  const outcome = await prisma.$transaction(async (tx) => {
    const record = await tokenRepository.findByHash(hashToken(refreshToken), tx);
    if (!record || record.expiresAt <= new Date()) return { error: true };
    if (record.revokedAt) {
      await tokenRepository.revokeFamily(record.familyId, tx);
      // Only a token that was rotated is "reuse"; one revoked by logout is merely stale.
      return { error: true, reuse: Boolean(record.replacedById), userId: record.userId };
    }
    // The conditional update also catches two concurrent refreshes of the same token:
    // only one can flip revokedAt, and the loser is treated as reuse.
    const revoked = await tokenRepository.revokeToken(record.id, tx);
    if (revoked.count === 0) {
      await tokenRepository.revokeFamily(record.familyId, tx);
      return { error: true, reuse: true, userId: record.userId };
    }
    const next = await persistRefreshToken(record.userId, record.familyId, tx, record.deviceName);
    await tokenRepository.setReplacedBy(record.id, next.record.id, tx);
    return {
      tokens: {
        accessToken: createAccessToken(record.userId, record.familyId),
        refreshToken: next.refreshToken,
        expiresIn: 600,
      },
    };
  });
  if (outcome.reuse) {
    await audit.record(outcome.userId, AUDIT_ACTIONS.REFRESH_REUSE, 'failure');
    notifications.notifyUser(outcome.userId, {
      title: 'Security alert',
      body: 'A signed-out session was reused, so it was ended. Sign in again on your device.',
    });
  }
  if (outcome.error) throw authError('Refresh token is invalid or expired.');
  return outcome.tokens;
}

/** Revokes the entire refresh-token family associated with this token. */
async function logout(refreshToken) {
  const record = await tokenRepository.findByHash(hashToken(refreshToken));
  if (record) {
    await tokenRepository.revokeFamily(record.familyId);
    await audit.record(record.userId, AUDIT_ACTIONS.LOGOUT);
  }
}

/** Revokes all active refresh tokens for the authenticated user. */
async function logoutAll(userId) {
  await tokenRepository.revokeAllForUser(userId);
  await audit.record(userId, AUDIT_ACTIONS.LOGOUT_ALL);
}

/** Verifies the user's current password or throws a generic 401. */
async function verifyPassword(userId, password) {
  const user = await userRepository.findById(userId);
  const matches = await bcrypt.compare(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  if (!user || !matches) throw authError('The password is incorrect.');
  return user;
}

/**
 * Changes the password, revokes every session (including this one), and returns a
 * fresh token pair so the current device stays signed in.
 */
async function changePassword(userId, { currentPassword, newPassword }, deviceName) {
  try {
    await verifyPassword(userId, currentPassword);
  } catch (error) {
    await audit.record(userId, AUDIT_ACTIONS.PASSWORD_CHANGE, 'failure');
    throw error;
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const tokens = await prisma.$transaction(async (tx) => {
    await userRepository.updatePasswordHash(userId, passwordHash, tx);
    await tokenRepository.revokeAllForUser(userId, tx);
    return issueTokens(userId, crypto.randomUUID(), tx, deviceName);
  });
  await audit.record(userId, AUDIT_ACTIONS.PASSWORD_CHANGE);
  notifications.notifyUser(userId, {
    title: 'Password changed',
    body: 'Your password was changed and your other sessions were signed out.',
  });
  return tokens;
}

/** Permanently deletes the account after re-verifying the password. */
async function deleteAccount(userId, password) {
  try {
    await verifyPassword(userId, password);
  } catch (error) {
    await audit.record(userId, AUDIT_ACTIONS.ACCOUNT_DELETE, 'failure');
    throw error;
  }
  // The audit row survives with userId set to NULL, so it no longer identifies anyone.
  await audit.record(userId, AUDIT_ACTIONS.ACCOUNT_DELETE);
  await userRepository.deleteById(userId);
}

/** Returns the authenticated user's public profile. */
async function getProfile(userId) {
  const user = await userRepository.findPublicById(userId);
  if (!user) throw authError('Sign in again to continue.');
  return user;
}

/** Lists the user's active sessions (one per refresh-token family). */
async function listSessions(userId, currentSessionId) {
  const active = await tokenRepository.listActiveForUser(userId);
  const familyIds = [...new Set(active.map((token) => token.familyId))];
  const starts = await tokenRepository.familyStartTimes(userId, familyIds);
  const startedAt = new Map(starts.map((row) => [row.familyId, row._min.createdAt]));
  const seen = new Set();
  return active
    .filter((token) => !seen.has(token.familyId) && seen.add(token.familyId))
    .map((token) => ({
      id: token.familyId,
      deviceName: token.deviceName,
      signedInAt: startedAt.get(token.familyId) ?? token.createdAt,
      lastRefreshedAt: token.createdAt,
      expiresAt: token.expiresAt,
      current: token.familyId === currentSessionId,
    }));
}

/** Revokes one of the user's sessions; another user's session ID behaves as not found. */
async function revokeSession(userId, sessionId) {
  const result = await tokenRepository.revokeFamilyForUser(userId, sessionId);
  if (result.count === 0) throw httpError(404, 'NOT_FOUND', 'Session not found.');
  await audit.record(userId, AUDIT_ACTIONS.SESSION_REVOKE);
}

/** Revokes every session except the caller's current one. */
async function revokeOtherSessions(userId, currentSessionId) {
  if (!currentSessionId) throw httpError(400, 'NO_SESSION', 'The current session is unknown. Sign in again.');
  await tokenRepository.revokeOthersForUser(userId, currentSessionId);
  await audit.record(userId, AUDIT_ACTIONS.SESSION_REVOKE);
}

module.exports = {
  register,
  login,
  issueTokens,
  refresh,
  logout,
  logoutAll,
  changePassword,
  deleteAccount,
  getProfile,
  listSessions,
  revokeSession,
  revokeOtherSessions,
};
