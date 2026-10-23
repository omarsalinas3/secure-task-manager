'use strict';

const { z } = require('zod');
const { cuid } = require('./task.schema');

/**
 * A small local deny-list of very common passwords. A production system should also
 * check a breached-password corpus (for example, a k-anonymity range API).
 */
const COMMON_PASSWORDS = new Set([
  '123456789012', 'password1234', 'passwordpassword', 'qwertyuiopas', '111111111111',
  '000000000000', 'iloveyou1234', 'administrator', 'letmein12345', 'welcome12345',
  'qwerty123456', 'abc123456789', 'password123!', 'changeme1234', '1q2w3e4r5t6y',
]);

/** Validates a new password: 12–128 characters and not a well-known password. */
const newPassword = () => z.string().min(12).max(128)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Choose a less common password.',
  });

/** Optional human-readable device label used only for session management. */
const deviceName = z.string().trim().min(1).max(60).optional();

/** Validates registration credentials. */
const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: newPassword(),
  deviceName,
});

/** Validates login credentials. */
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  deviceName,
});

/** Validates an opaque refresh token. */
const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

/** Validates a password change; the new password must differ from the current one. */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPassword(),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'The new password must be different.',
  path: ['newPassword'],
});

/** Validates account deletion, which requires re-entering the password. */
const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

/** Validates a session (refresh-token family) route parameter. */
const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});

/** Validates a push-notification device registration. */
const deviceSchema = z.object({
  pushToken: z.string().min(16).max(4096),
  platform: z.enum(['android', 'ios', 'web']),
});

/** Validates a push-token removal. */
const deviceRemovalSchema = z.object({
  pushToken: z.string().min(16).max(4096),
});

/** Validates an administrator role change. */
const roleChangeSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
});

/** Validates a user ID route parameter. */
const userIdParamSchema = z.object({ userId: cuid() });

/** Validates administrator list paging. */
const adminListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().regex(/^[a-z_.]{1,60}$/).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  deleteAccountSchema,
  sessionIdParamSchema,
  deviceSchema,
  deviceRemovalSchema,
  roleChangeSchema,
  userIdParamSchema,
  adminListSchema,
};
