'use strict';

const request = require('supertest');
const { app } = require('../src/app');
const { prisma } = require('../src/repositories/prisma');

let counter = 0;

/** Returns a unique test email so tests never depend on each other's accounts. */
function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}-${Date.now()}-${process.pid}-${counter}@example.test`;
}

const PASSWORD = 'a-long-test-password';

/** Registers a fresh account and returns its credentials and tokens. */
async function registerUser(prefix) {
  const email = uniqueEmail(prefix);
  const response = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });
  if (response.status !== 201) throw new Error(`register failed: ${response.status}`);
  return { email, password: PASSWORD, ...response.body };
}

/** Builds an Authorization header for an access token. */
function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Removes every account created by the test suite (all use @example.test). */
async function cleanDatabase() {
  await prisma.user.deleteMany({ where: { email: { endsWith: '@example.test' } } });
  await prisma.auditEvent.deleteMany({ where: { userId: null } });
}

module.exports = { app, prisma, request, uniqueEmail, registerUser, bearer, cleanDatabase, PASSWORD };
