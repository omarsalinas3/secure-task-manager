'use strict';

const auditRepository = require('../repositories/audit.repository');
const { logger } = require('../utils/logger');
const { env } = require('../config');

/** Every action the API records. Keep this list short and security-relevant. */
const AUDIT_ACTIONS = Object.freeze({
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH_REUSE: 'auth.refresh_reuse_detected',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  PASSWORD_CHANGE: 'auth.password_change',
  ACCOUNT_DELETE: 'auth.account_delete',
  SESSION_REVOKE: 'auth.session_revoke',
  ROLE_CHANGE: 'admin.role_change',
});

/**
 * Records an audit event. Only the user ID, action, and outcome are stored:
 * no email addresses, IP addresses, user agents, tokens, or request bodies.
 * A failure to write is logged but never breaks the user-facing request.
 *
 * @param {string|null} userId - Affected user, when known.
 * @param {string} action - One of AUDIT_ACTIONS.
 * @param {'success'|'failure'} [outcome] - Result of the action.
 * @param {object} [db] - Prisma client or transaction.
 * @returns {Promise<void>} Resolves when recorded or when recording failed safely.
 */
async function record(userId, action, outcome = 'success', db) {
  try {
    await auditRepository.create({ userId, action, outcome }, db);
  } catch (error) {
    logger.error({ err: error, action }, 'Audit event could not be recorded');
  }
}

/** Lists the authenticated user's own recent events. */
function listOwn(userId, limit = 50) {
  return auditRepository.listForUser(userId, limit);
}

/** Lists recent events for administrators. */
function listRecent(limit, action) {
  return auditRepository.listRecent(limit, action);
}

/** Deletes events older than the configured retention period. */
function purgeExpired(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return auditRepository.deleteOlderThan(cutoff);
}

module.exports = { AUDIT_ACTIONS, record, listOwn, listRecent, purgeExpired };
