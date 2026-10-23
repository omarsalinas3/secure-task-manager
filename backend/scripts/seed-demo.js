'use strict';

/**
 * Creates local demo data: an administrator, a regular user, and sample tasks.
 * Local development only — it refuses to run unless DATABASE_URL points to localhost.
 *
 * Usage: npm run seed:demo
 * Demo accounts (local test values, never use them anywhere else):
 *   demo@example.test   / demo-password-1234   (ADMIN)
 *   alex@example.test   / alex-password-1234   (USER)
 */
require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const { prisma } = require('../src/repositories/prisma');

const ACCOUNTS = [
  { email: 'demo@example.test', password: 'demo-password-1234', role: 'ADMIN' },
  { email: 'alex@example.test', password: 'alex-password-1234', role: 'USER' },
];

const DEMO_TASKS = [
  { title: 'Review API security', description: 'Check ownership and validation', completed: false },
  { title: 'Write Flutter tests', description: 'Widget and repository tests', completed: true },
  { title: 'Rotate refresh tokens', description: 'Confirm reuse detection revokes the family', completed: true },
  { title: 'Document the OpenAPI contract', description: null, completed: false },
  { title: 'Configure CI pipeline', description: 'Tests, migrations, audit, secret scanning', completed: false },
  { title: 'Plan deployment behind HTTPS', description: 'Reverse proxy and secret manager', completed: false },
];

async function main() {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error('Refusing to seed: DATABASE_URL is not a local database.');
    process.exitCode = 1;
    return;
  }

  for (const account of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, 12);
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: { email: account.email, passwordHash, role: account.role },
      update: { passwordHash, role: account.role },
    });
    await prisma.task.deleteMany({ where: { ownerId: user.id } });
    const tasks = account.role === 'ADMIN' ? DEMO_TASKS : DEMO_TASKS.slice(0, 2);
    // Inserted oldest-first with distinct timestamps so the list order is predictable.
    for (const [index, task] of [...tasks].reverse().entries()) {
      await prisma.task.create({
        data: { ...task, ownerId: user.id, createdAt: new Date(Date.now() - (tasks.length - index) * 60000) },
      });
    }
    console.info(`Seeded ${account.email} (${account.role}) with ${tasks.length} tasks.`);
  }
}

main()
  .catch((error) => {
    console.error('Seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
