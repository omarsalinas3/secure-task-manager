'use strict';

const { prisma } = require('./task.repository');

/** Creates a refresh-token record using the supplied Prisma client or transaction. */
function createToken(data, db = prisma) {
  return db.refreshToken.create({ data });
}

/** Finds a refresh-token record by its stored token hash. */
function findByHash(tokenHash, db = prisma) {
  return db.refreshToken.findUnique({ where: { tokenHash } });
}

/** Revokes one token record if it has not already been revoked. */
function revokeToken(id, db = prisma) {
  return db.refreshToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Links a rotated token to its replacement so the rotation chain can be inspected. */
function setReplacedBy(id, replacedById, db = prisma) {
  return db.refreshToken.update({ where: { id }, data: { replacedById } });
}

/** Revokes every token in a token family. */
function revokeFamily(familyId, db = prisma) {
  return db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes a token family only when it belongs to the given user. */
function revokeFamilyForUser(userId, familyId, db = prisma) {
  return db.refreshToken.updateMany({
    where: { userId, familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every active refresh token belonging to a user. */
function revokeAllForUser(userId, db = prisma) {
  return db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every active refresh token of a user except those in one family. */
function revokeOthersForUser(userId, keepFamilyId, db = prisma) {
  return db.refreshToken.updateMany({
    where: { userId, revokedAt: null, NOT: { familyId: keepFamilyId } },
    data: { revokedAt: new Date() },
  });
}

/** Whether a user's session (token family) still has an unrevoked, unexpired token. */
async function isFamilyActive(userId, familyId, db = prisma) {
  const active = await db.refreshToken.findFirst({
    where: { userId, familyId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return active !== null;
}

/** Lists a user's active (unrevoked, unexpired) tokens; rotation keeps one per family. */
function listActiveForUser(userId, db = prisma) {
  return db.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { familyId: true, deviceName: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** Returns when each listed family was first issued (the session's sign-in time). */
function familyStartTimes(userId, familyIds, db = prisma) {
  return db.refreshToken.groupBy({
    by: ['familyId'],
    where: { userId, familyId: { in: familyIds } },
    _min: { createdAt: true },
  });
}

module.exports = {
  createToken,
  findByHash,
  revokeToken,
  setReplacedBy,
  revokeFamily,
  revokeFamilyForUser,
  revokeAllForUser,
  revokeOthersForUser,
  isFamilyActive,
  listActiveForUser,
  familyStartTimes,
};
