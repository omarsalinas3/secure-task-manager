'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
  taskIdParamSchema,
} = require('../schemas/task.schema');
const { taskController: controller } = require('../controllers/task.controller');
const { asyncRoute } = require('../utils/http-error');

const router = express.Router();
const validTaskId = validate(taskIdParamSchema, 'params');

router.use(requireAuth);

router.get('/', validate(listTasksSchema, 'query'), asyncRoute(controller.list));
router.post('/', validate(createTaskSchema, 'body'), asyncRoute(controller.create));
router.get('/:taskId', validTaskId, asyncRoute(controller.get));
router.patch('/:taskId', validTaskId, validate(updateTaskSchema, 'body'), asyncRoute(controller.update));
router.delete('/:taskId', validTaskId, asyncRoute(controller.remove));

module.exports = router;
