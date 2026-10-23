'use strict';

const request = require('supertest');
const { app } = require('../src/app');
const { prisma } = require('../src/repositories/prisma');

afterAll(() => prisma.$disconnect());

describe('health endpoint', () => {
  test('returns a healthy status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('sets security headers and hides the framework', async () => {
    const response = await request(app).get('/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('unknown routes return a safe 404', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  test('rejects browser origins that are not allow-listed', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_REJECTED');
  });
});
