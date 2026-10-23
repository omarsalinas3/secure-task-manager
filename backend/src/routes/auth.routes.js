'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { env } = require('../config');
const { requireAuth } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  deleteAccountSchema,
  sessionIdParamSchema,
  deviceSchema,
  deviceRemovalSchema,
} = require('../schemas/auth.schema');
const { authController: controller } = require('../controllers/auth.controller');
const { asyncRoute } = require('../utils/http-error');

const router = express.Router();
const limiter = (max) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: max,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // The automated test suite registers many users; one test opts back in with this header.
  skip: (req) => env.NODE_ENV === 'test' && req.get('x-test-enforce-rate-limit') !== '1',
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } },
});

/** Registers an account and returns its initial token pair. */
router.post('/register', limiter(10), validate(registerSchema, 'body'), asyncRoute(controller.register));

/** Authenticates an account and returns its token pair. */
router.post('/login', limiter(10), validate(loginSchema, 'body'), asyncRoute(controller.login));

/** Rotates a refresh token and returns the replacement pair. */
router.post('/refresh', limiter(30), validate(refreshSchema, 'body'), asyncRoute(controller.refresh));

/** Revokes the refresh-token family supplied by the client. */
router.post('/logout', limiter(30), validate(refreshSchema, 'body'), asyncRoute(controller.logout));

/** Revokes all refresh tokens belonging to the authenticated user. */
router.post('/logout-all', requireAuth, asyncRoute(controller.logoutAll));

/** Returns the authenticated user's profile. */
router.get('/me', requireAuth, asyncRoute(controller.me));

/** Changes the password and revokes every other session. */
router.post('/change-password', requireAuth, limiter(10), validate(changePasswordSchema, 'body'),
  asyncRoute(controller.changePassword));

/** Permanently deletes the account (password re-entry required). */
router.delete('/account', requireAuth, limiter(10), validate(deleteAccountSchema, 'body'),
  asyncRoute(controller.deleteAccount));

/** Lists active sessions. */
router.get('/sessions', requireAuth, asyncRoute(controller.listSessions));

/** Revokes all sessions except the current one. */
router.delete('/sessions', requireAuth, asyncRoute(controller.revokeOtherSessions));

/** Revokes one session. */
router.delete('/sessions/:sessionId', requireAuth, validate(sessionIdParamSchema, 'params'),
  asyncRoute(controller.revokeSession));

/** Lists the user's own security events. */
router.get('/audit', requireAuth, asyncRoute(controller.listAudit));

/** Registers, lists, and removes push-notification devices. */
router.post('/devices', requireAuth, limiter(30), validate(deviceSchema, 'body'), asyncRoute(controller.registerDevice));
router.get('/devices', requireAuth, asyncRoute(controller.listDevices));
router.post('/devices/unregister', requireAuth, validate(deviceRemovalSchema, 'body'),
  asyncRoute(controller.unregisterDevice));

module.exports = router;
