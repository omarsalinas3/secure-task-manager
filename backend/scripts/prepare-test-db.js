'use strict';

/**
 * Applies migrations to the isolated test database defined in .env.test.
 * Refuses to run against anything but a local database whose name ends in "_test".
 */
const path = require('node:path');
const { execSync } = require('node:child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });

const url = new URL(process.env.DATABASE_URL);
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
if (!isLocal || !url.pathname.endsWith('_test')) {
  console.error('Refusing to migrate: DATABASE_URL must be a local database ending in "_test".');
  process.exit(1);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
