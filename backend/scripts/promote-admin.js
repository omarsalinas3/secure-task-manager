'use strict';

/**
 * Promotes an existing account to ADMIN. There is deliberately no API route that lets a
 * user become the first administrator; it must be done by someone with server access.
 *
 * Usage: npm run user:promote -- someone@example.test
 */
require('dotenv').config({ quiet: true });

const { prisma } = require('../src/repositories/prisma');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run user:promote -- <email>');
    process.exitCode = 1;
    return;
  }
  const result = await prisma.user.updateMany({ where: { email }, data: { role: 'ADMIN' } });
  if (result.count === 0) {
    console.error('No account found with that email.');
    process.exitCode = 1;
    return;
  }
  // Existing sessions are revoked so the new role is used from a fresh sign-in.
  await prisma.refreshToken.updateMany({
    where: { user: { email }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  console.info('Account promoted to ADMIN. Sign in again to use it.');
}

main().finally(() => prisma.$disconnect());
