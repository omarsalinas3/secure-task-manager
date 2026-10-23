'use strict';

const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/refresh-token.repository');
const { prisma } = require('../repositories/prisma');
const { httpError } = require('../utils/http-error');
const audit = require('./audit.service');

/** Lists users (public fields and task counts only; never task contents). */
async function listUsers({ page, limit }) {
  const [users, total] = await Promise.all([
    userRepository.listForAdmin((page - 1) * limit, limit),
    userRepository.count(),
  ]);
  return {
    items: users.map(({ _count, ...user }) => ({ ...user, taskCount: _count.tasks })),
    page,
    limit,
    total,
  };
}

/**
 * Changes another user's role. Administrators cannot change their own role, which
 * also guarantees at least one administrator remains.
 */
async function changeRole(actorId, targetUserId, role) {
  if (actorId === targetUserId) {
    throw httpError(400, 'SELF_ROLE_CHANGE', 'You cannot change your own role.');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const target = await userRepository.findPublicById(targetUserId, tx);
    if (!target) throw httpError(404, 'NOT_FOUND', 'User not found.');
    const user = await userRepository.updateRole(targetUserId, role, tx);
    // Sessions are revoked so the new privileges are picked up with fresh sign-ins.
    if (target.role !== role) await tokenRepository.revokeAllForUser(targetUserId, tx);
    return user;
  });
  await audit.record(targetUserId, audit.AUDIT_ACTIONS.ROLE_CHANGE);
  return updated;
}

/** Lists recent audit events, optionally filtered by action. */
function listAudit({ limit, action }) {
  return audit.listRecent(limit, action);
}

module.exports = { listUsers, changeRole, listAudit };
