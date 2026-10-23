'use strict';

const { z } = require('zod');

/** Validates required environment configuration before the server starts. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default(''),
  PUSH_PROVIDER: z.enum(['log', 'none']).default('none'),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(90),
});

/** Parsed and validated application configuration. */
const env = envSchema.parse(process.env);

/** Returns the configured CORS origins as a set. */
function getAllowedOrigins() {
  return new Set(
    env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

module.exports = { env, getAllowedOrigins };
