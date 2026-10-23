'use strict';

const repository = require('../repositories/task.repository');
const { httpError } = require('../utils/http-error');

/** Builds the error used whenever a task is missing or owned by someone else. */
function notFound() {
  return httpError(404, 'NOT_FOUND', 'Task not found.');
}

/**
 * Creates task business operations with ownership enforcement.
 */
class TaskService {
  /**
   * Lists the user's tasks with pagination, search, and a completion filter.
   * Offset paging uses `page`; passing `cursor` switches to stable cursor paging.
   *
   * @param {string} userId - Authenticated user ID.
   * @param {{page: number, limit: number, cursor?: string, q?: string, status: string}} query
   *   Validated query options.
   * @returns {Promise<object>} Paginated task result.
   */
  async list(userId, { page, limit, cursor, q, status }) {
    if (cursor && !(await repository.findOwned(userId, cursor))) {
      throw httpError(400, 'INVALID_CURSOR', 'The pagination cursor is not valid.');
    }
    const filters = { q, status };
    // One extra row tells whether another page exists without a second query.
    const [rows, total] = await Promise.all([
      repository.listByOwner(userId, (page - 1) * limit, limit + 1, { ...filters, cursor }),
      repository.countByOwner(userId, filters),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      page,
      limit,
      total,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /**
   * Returns one task owned by the authenticated user.
   *
   * @param {string} userId - Authenticated user ID.
   * @param {string} taskId - Task ID.
   * @returns {Promise<object>} The task.
   * @throws {Error} When the owned task does not exist.
   */
  async get(userId, taskId) {
    const task = await repository.findOwned(userId, taskId);
    if (!task) throw notFound();
    return task;
  }

  /**
   * Creates a task owned by the authenticated user.
   *
   * @param {string} userId - Authenticated user ID.
   * @param {object} data - Validated create payload.
   * @returns {Promise<object>} Created task.
   */
  async create(userId, data) {
    try {
      return await repository.create(userId, data);
    } catch (error) {
      // A still-valid access token may outlive a deleted account.
      if (error.code === 'P2003') throw httpError(401, 'UNAUTHENTICATED', 'Sign in again to continue.');
      throw error;
    }
  }

  /**
   * Updates one task owned by the authenticated user.
   *
   * @param {string} userId - Authenticated user ID.
   * @param {string} taskId - Task ID.
   * @param {object} data - Validated update payload.
   * @returns {Promise<object>} Updated task.
   * @throws {Error} When the owned task does not exist.
   */
  async update(userId, taskId, data) {
    const updated = await repository.updateOwned(userId, taskId, data);
    if (!updated) throw notFound();
    return updated;
  }

  /**
   * Deletes one task owned by the authenticated user.
   *
   * @param {string} userId - Authenticated user ID.
   * @param {string} taskId - Task ID.
   * @returns {Promise<void>} Resolves when deleted.
   * @throws {Error} When the owned task does not exist.
   */
  async delete(userId, taskId) {
    const deleted = await repository.deleteOwned(userId, taskId);
    if (!deleted) throw notFound();
  }
}

module.exports = { TaskService };
