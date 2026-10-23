'use strict';

const { prisma } = require('./prisma');

/** Registers a push token; a token moves to whichever user registered it last. */
function upsert(userId, pushToken, platform, db = prisma) {
  return db.deviceToken.upsert({
    where: { pushToken },
    create: { userId, pushToken, platform },
    update: { userId, platform },
    select: { id: true, platform: true, createdAt: true },
  });
}

/** Removes a push token only when it belongs to the user. */
function removeOwned(userId, pushToken, db = prisma) {
  return db.deviceToken.deleteMany({ where: { userId, pushToken } });
}

/** Lists a user's push tokens; used only for delivery, never returned to clients. */
function listTokensForUser(userId, db = prisma) {
  return db.deviceToken.findMany({ where: { userId }, select: { pushToken: true, platform: true } });
}

/** Lists a user's registered devices without their tokens. */
function listPublicForUser(userId, db = prisma) {
  return db.deviceToken.findMany({
    where: { userId },
    select: { id: true, platform: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { upsert, removeOwned, listTokensForUser, listPublicForUser };
