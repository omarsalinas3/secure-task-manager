'use strict';

const { TaskService } = require('../services/task.service');

const service = new TaskService();

/**
 * Translates HTTP requests into task operations. The owner is always req.user.id.
 */
const taskController = {
  /** Lists the user's tasks (paged, searchable, filterable). */
  async list(req, res) {
    res.json(await service.list(req.user.id, req.query));
  },

  /** Returns one of the user's tasks. */
  async get(req, res) {
    res.json({ item: await service.get(req.user.id, req.params.taskId) });
  },

  /** Creates a task for the user. */
  async create(req, res) {
    const task = await service.create(req.user.id, req.body);
    res.status(201).json({ item: task });
  },

  /** Updates one of the user's tasks. */
  async update(req, res) {
    const item = await service.update(req.user.id, req.params.taskId, req.body);
    res.json({ item });
  },

  /** Deletes one of the user's tasks. */
  async remove(req, res) {
    await service.delete(req.user.id, req.params.taskId);
    res.status(204).end();
  },
};

module.exports = { taskController };
