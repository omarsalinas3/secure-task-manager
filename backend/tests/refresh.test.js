'use strict';

const request = require('supertest');
const { app } = require('../src/app');
const { prisma } = require('../src/repositories/prisma');
const { cleanDatabase } = require('./helpers');

beforeAll(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('refresh-token lifecycle', () => {
  let counter = 0;
  const password = 'a-long-test-password';

  async function register() {
    counter += 1;
    const email = `refresh-${Date.now()}-${counter}@example.test`;
    const response = await request(app).post('/api/v1/auth/register')
      .send({ email, password });
    expect(response.status).toBe(201);
    return { email, ...response.body };
  }

  test('rotation returns a different refresh token', async () => {
    const initial = await register();
    const response = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken });
    expect(response.status).toBe(200);
    expect(response.body.refreshToken).not.toBe(initial.refreshToken);
  });

  test('rotation links the old record to its replacement in the same family', async () => {
    const initial = await register();
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: initial.refreshToken });
    const rows = await prisma.refreshToken.findMany({
      where: { user: { email: initial.email } },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].familyId).toBe(rows[1].familyId);
    expect(rows[0].revokedAt).not.toBeNull();
    expect(rows[0].replacedById).toBe(rows[1].id);
    expect(rows[1].revokedAt).toBeNull();
  });

  test('reuse of an old token revokes the newer token family token', async () => {
    const initial = await register();
    const rotated = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken });
    expect(rotated.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken });
    expect(reuse.status).toBe(401);

    const newer = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(newer.status).toBe(401);
  });

  test('concurrent refreshes of one token never yield two valid tokens', async () => {
    const initial = await register();
    const results = await Promise.all([1, 2, 3].map(() => request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: initial.refreshToken })));
    const active = await prisma.refreshToken.count({
      where: { user: { email: initial.email }, revokedAt: null },
    });
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(active).toBeLessThanOrEqual(1);
  });

  test('logout makes the refresh token unusable', async () => {
    const tokens = await register();
    const logout = await request(app).post('/api/v1/auth/logout')
      .send({ refreshToken: tokens.refreshToken });
    expect(logout.status).toBe(204);

    const refresh = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(refresh.status).toBe(401);
  });

  test('logout-all revokes every session of the user', async () => {
    const first = await register();
    const second = await request(app).post('/api/v1/auth/login')
      .send({ email: first.email, password });
    expect(second.status).toBe(200);

    const logoutAll = await request(app).post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${first.accessToken}`);
    expect(logoutAll.status).toBe(204);

    for (const token of [first.refreshToken, second.body.refreshToken]) {
      const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token });
      expect(refresh.status).toBe(401);
    }
  });

  test('revocation also stops the session\'s unexpired access token immediately', async () => {
    const tokens = await register();
    const before = await request(app).get('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(before.status).toBe(200);

    await request(app).post('/api/v1/auth/logout').send({ refreshToken: tokens.refreshToken });

    const after = await request(app).get('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(after.status).toBe(401);
  });

  test('an expired refresh token is rejected', async () => {
    const tokens = await register();
    await prisma.refreshToken.updateMany({
      where: { user: { email: tokens.email } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const refresh = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });
    expect(refresh.status).toBe(401);
  });

  test('an unknown refresh token is rejected', async () => {
    const refresh = await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(64) });
    expect(refresh.status).toBe(401);
  });
});
