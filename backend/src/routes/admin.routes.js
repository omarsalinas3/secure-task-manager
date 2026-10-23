'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { adminListSchema, roleChangeSchema, userIdParamSchema } = require('../schemas/auth.schema');
const { adminController: controller } = require('../controllers/admin.controller');
const { asyncRoute } = require('../utils/http-error');

const router = express.Router();

// Every admin route requires a valid token AND the ADMIN role read from the database.
router.use(requireAuth, requireRole('ADMIN'));

router.get('/users', validate(adminListSchema, 'query'), asyncRoute(controller.listUsers));
router.patch('/users/:userId/role', validate(userIdParamSchema, 'params'), validate(roleChangeSchema, 'body'),
  asyncRoute(controller.changeRole));
router.get('/audit', validate(adminListSchema, 'query'), asyncRoute(controller.listAudit));

module.exports = router;
