'use strict';

/**
 * Deletes audit events older than AUDIT_RETENTION_DAYS (data minimization).
 * Schedule it daily, for example with cron or the hosting platform's job runner.
 */
require('dotenv').config({ quiet: true });

const { purgeExpired } = require('../src/services/audit.service');
const { prisma } = require('../src/repositories/prisma');

purgeExpired()
  .then((result) => console.info(`Deleted ${result.count} expired audit events.`))
  .catch((error) => {
    console.error('Audit purge failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
