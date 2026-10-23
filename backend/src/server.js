'use strict';

require('dotenv').config();

const { app } = require('./app');
const { env } = require('./config');
const { prisma } = require('./repositories/task.repository');

const server = app.listen(env.PORT, () => {
  console.info(`API listening on port ${env.PORT}`);
});

/** Closes HTTP and database connections before process exit. */
async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
