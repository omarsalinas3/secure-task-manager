'use strict';

const { prisma } = require('./prisma');

/** Fields that are safe to return to clients (never the password hash). */
const PUBLIC_FIELDS = { id: true, email: true, role: true, createdAt: true };

/** Finds a user by normalized email, including the password hash for verification. */
function findByEmail(email, db = prisma) {
  return db.user.findUnique({ where: { email } });
}

/** Finds a user by ID, including the password hash for verification. */
function findById(id, db = prisma) {
  return db.user.findUnique({ where: { id } });
}

/** Returns only public profile fields for a user. */
function findPublicById(id, db = prisma) {
  return db.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
}

/** Creates a user with an already-hashed password. */
function create({ email, passwordHash }, db = prisma) {
  return db.user.create({ data: { email, passwordHash } });
}

/** Replaces a user's password hash. */
function updatePasswordHash(id, passwordHash, db = prisma) {
  return db.user.update({ where: { id }, data: { passwordHash } });
}

/** Deletes a user; tasks, tokens, and devices cascade, audit events are detached. */
function deleteById(id, db = prisma) {
  return db.user.delete({ where: { id } });
}

/** Lists users with task counts for administrators. */
function listForAdmin(skip, take, db = prisma) {
  return db.user.findMany({
    select: { ...PUBLIC_FIELDS, _count: { select: { tasks: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take,
  });
}

/** Counts all users. */
function count(db = prisma) {
  return db.user.count();
}

/** Changes a user's role and returns public fields. */
function updateRole(id, role, db = prisma) {
  return db.user.update({ where: { id }, data: { role }, select: PUBLIC_FIELDS });
}

module.exports = {
  PUBLIC_FIELDS,
  findByEmail,
  findById,
  findPublicById,
  create,
  updatePasswordHash,
  deleteById,
  listForAdmin,
  count,
  updateRole,
};
