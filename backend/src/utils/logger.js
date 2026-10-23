'use strict';

const pino = require('pino');
const { env } = require('../config');

/** Paths that must never reach logs. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.refreshToken',
  'req.body.pushToken',
  'req.query.token',
  '*.pushToken',
  '*.refreshToken',
  '*.accessToken',
];

/** Shared application logger. */
const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: REDACT_PATHS,
});

module.exports = { logger, REDACT_PATHS };
