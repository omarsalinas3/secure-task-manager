'use strict';

const { prisma } = require('./prisma');

/** Audit events hold no personal fields, so every column is safe to return. */
const AUDIT_FIELDS = { id: true, userId: true, action: true, outcome: true, createdAt: true };

/** Persists one audit event. */
function create({ userId = null, action, outcome }, db = prisma) {
  return db.auditEvent.create({ data: { userId, action, outcome } });
}

/** Lists a user's own recent audit events. */
function listForUser(userId, take, db = prisma) {
  return db.auditEvent.findMany({
    where: { userId },
    select: AUDIT_FIELDS,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
  });
}

/** Lists recent audit events across all users, optionally filtered by action. */
function listRecent(take, action, db = prisma) {
  return db.auditEvent.findMany({
    where: action ? { action } : {},
    select: AUDIT_FIELDS,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
  });
}

/** Deletes events older than the cutoff date (retention policy). */
function deleteOlderThan(cutoff, db = prisma) {
  return db.auditEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

module.exports = { create, listForUser, listRecent, deleteOlderThan };
