'use strict';

const { prisma } = require('./prisma');

/** Deterministic order: createdAt alone can tie, so the ID breaks ties for stable pages. */
const STABLE_ORDER = [{ createdAt: 'desc' }, { id: 'desc' }];

/**
 * Builds the owner-scoped filter used by list queries.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {{q?: string, status?: 'all'|'pending'|'completed'}} filters - Validated filters.
 * @returns {object} Prisma where clause that always includes ownerId.
 */
function ownerFilter(ownerId, { q, status } = {}) {
  const where = { ownerId };
  if (status === 'pending') where.completed = false;
  if (status === 'completed') where.completed = true;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Lists only one user's tasks with bounded pagination.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {number} skip - Number of records to skip.
 * @param {number} take - Maximum number of records.
 * @param {{q?: string, status?: string, cursor?: string}} [options] - Filters and cursor.
 * @returns {Promise<import('@prisma/client').Task[]>} Matching tasks.
 */
function listByOwner(ownerId, skip, take, options = {}) {
  const query = {
    where: ownerFilter(ownerId, options),
    orderBy: STABLE_ORDER,
    skip,
    take,
  };
  if (options.cursor) {
    query.cursor = { id: options.cursor };
    query.skip = 1;
  }
  return prisma.task.findMany(query);
}

/**
 * Counts one user's tasks that match the filters.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {{q?: string, status?: string}} [filters] - Validated filters.
 * @returns {Promise<number>} Matching task count.
 */
function countByOwner(ownerId, filters = {}) {
  return prisma.task.count({ where: ownerFilter(ownerId, filters) });
}

/**
 * Finds a task only when it belongs to the given user.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {string} taskId - Task identifier from the route.
 * @returns {Promise<import('@prisma/client').Task|null>} Owned task or null.
 */
function findOwned(ownerId, taskId) {
  return prisma.task.findFirst({ where: { id: taskId, ownerId } });
}

/**
 * Creates a task for one user.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {{title: string, description?: string}} data - Validated task data.
 * @returns {Promise<import('@prisma/client').Task>} Created task.
 */
function create(ownerId, data) {
  return prisma.task.create({ data: { ...data, ownerId } });
}

/**
 * Updates a task only when it belongs to the given user.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {string} taskId - Task identifier.
 * @param {object} data - Validated fields to update.
 * @returns {Promise<import('@prisma/client').Task|null>} Updated task or null.
 */
async function updateOwned(ownerId, taskId, data) {
  const result = await prisma.task.updateMany({
    where: { id: taskId, ownerId },
    data,
  });
  if (result.count === 0) return null;
  return findOwned(ownerId, taskId);
}

/**
 * Deletes a task only when it belongs to the given user.
 *
 * @param {string} ownerId - Authenticated user identifier.
 * @param {string} taskId - Task identifier.
 * @returns {Promise<boolean>} Whether a matching task was deleted.
 */
async function deleteOwned(ownerId, taskId) {
  const result = await prisma.task.deleteMany({
    where: { id: taskId, ownerId },
  });
  return result.count === 1;
}

module.exports = {
  prisma, listByOwner, countByOwner, findOwned, create, updateOwned, deleteOwned,
};
