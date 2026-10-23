'use strict';

const adminService = require('../services/admin.service');

/** Translates administrator requests. Routes guarantee requireRole('ADMIN') ran first. */
const adminController = {
  /** Lists users with task counts. */
  async listUsers(req, res) {
    res.json(await adminService.listUsers(req.query));
  },

  /** Changes a user's role. */
  async changeRole(req, res) {
    res.json({ item: await adminService.changeRole(req.user.id, req.params.userId, req.body.role) });
  },

  /** Lists recent audit events. */
  async listAudit(req, res) {
    res.json({ items: await adminService.listAudit(req.query) });
  },
};

module.exports = { adminController };
