'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/refresh-token.repository');

/**
 * Verifies a short-lived access token and sets req.user.
 * The token's session must still be active, so logout, logout-all, password changes,
 * session revocation, and account deletion take effect on the very next request.
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express continuation.
 * @returns {Promise<void>}
 */
async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer ([^\s]+)$/.exec(header);

  if (!match) {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
    });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'task-manager-api',
      audience: 'task-manager-client',
    });

    if (typeof payload === 'string' || payload.type !== 'access' || !payload.sub || !payload.sid) {
      throw new Error('Invalid token.');
    }
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in again to continue.' },
    });
  }

  try {
    if (!(await tokenRepository.isFamilyActive(payload.sub, payload.sid))) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in again to continue.' },
      });
    }
  } catch (error) {
    return next(error);
  }

  req.user = { id: payload.sub, sessionId: payload.sid };
  next();
}

/**
 * Allows the request only when the authenticated user currently has one of the roles.
 * The role is read from the database so a demotion takes effect immediately.
 *
 * @param {...string} roles - Roles allowed to continue.
 * @returns {import('express').RequestHandler} Authorization middleware (use after requireAuth).
 */
function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await userRepository.findPublicById(req.user.id);
      if (!user) {
        return res.status(401).json({
          error: { code: 'UNAUTHENTICATED', message: 'Sign in again to continue.' },
        });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' },
        });
      }
      req.user.role = user.role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireAuth, requireRole };
