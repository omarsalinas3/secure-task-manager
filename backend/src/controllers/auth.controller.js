'use strict';

const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const notifications = require('../services/notification.service');

/**
 * Translates HTTP requests into authentication and account operations.
 * Every handler reads identity from req.user, never from the request body.
 */
const authController = {
  /** Registers an account and returns its initial token pair. */
  async register(req, res) {
    res.status(201).json(await authService.register(req.body));
  },

  /** Authenticates an account and returns its token pair. */
  async login(req, res) {
    res.json(await authService.login(req.body));
  },

  /** Rotates a refresh token and returns the replacement pair. */
  async refresh(req, res) {
    res.json(await authService.refresh(req.body.refreshToken));
  },

  /** Revokes the refresh-token family supplied by the client. */
  async logout(req, res) {
    await authService.logout(req.body.refreshToken);
    res.status(204).end();
  },

  /** Revokes all refresh tokens belonging to the authenticated user. */
  async logoutAll(req, res) {
    await authService.logoutAll(req.user.id);
    res.status(204).end();
  },

  /** Returns the authenticated user's profile. */
  async me(req, res) {
    res.json({ user: await authService.getProfile(req.user.id) });
  },

  /** Changes the password, signs out other sessions, and returns a new token pair. */
  async changePassword(req, res) {
    res.json(await authService.changePassword(req.user.id, req.body, req.body.deviceName));
  },

  /** Permanently deletes the authenticated user's account. */
  async deleteAccount(req, res) {
    await authService.deleteAccount(req.user.id, req.body.password);
    res.status(204).end();
  },

  /** Lists active sessions for device/session management. */
  async listSessions(req, res) {
    res.json({ items: await authService.listSessions(req.user.id, req.user.sessionId) });
  },

  /** Revokes one session by ID. */
  async revokeSession(req, res) {
    await authService.revokeSession(req.user.id, req.params.sessionId);
    res.status(204).end();
  },

  /** Revokes all sessions except the current one. */
  async revokeOtherSessions(req, res) {
    await authService.revokeOtherSessions(req.user.id, req.user.sessionId);
    res.status(204).end();
  },

  /** Lists the user's own recent security events. */
  async listAudit(req, res) {
    res.json({ items: await audit.listOwn(req.user.id) });
  },

  /** Registers a push-notification device. */
  async registerDevice(req, res) {
    res.status(201).json({ item: await notifications.registerDevice(req.user.id, req.body) });
  },

  /** Lists registered devices (without push tokens). */
  async listDevices(req, res) {
    res.json({ items: await notifications.listDevices(req.user.id) });
  },

  /** Unregisters a push-notification device. */
  async unregisterDevice(req, res) {
    await notifications.unregisterDevice(req.user.id, req.body.pushToken);
    res.status(204).end();
  },
};

module.exports = { authController };
