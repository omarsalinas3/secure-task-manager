'use strict';

const {
  app, prisma, request, registerUser, bearer, cleanDatabase, PASSWORD,
} = require('./helpers');

beforeAll(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

/** Creates an account, promotes it directly in the database, and signs in again. */
async function registerAdmin() {
  const user = await registerUser('admin');
  await prisma.user.update({ where: { email: user.email }, data: { role: 'ADMIN' } });
  const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
  const { id } = await prisma.user.findUnique({ where: { email: user.email } });
  return { ...user, ...login.body, id };
}

describe('role-based authorization', () => {
  test.each([
    ['GET', '/api/v1/admin/users'],
    ['GET', '/api/v1/admin/audit'],
    ['PATCH', '/api/v1/admin/users/cmvk3wzhk0000uogc0eo3jopx/role'],
  ])('a regular user gets 403 on %s %s', async (method, path) => {
    const user = await registerUser('plain');
    const response = await request(app)[method.toLowerCase()](path).set(bearer(user.accessToken)).send({ role: 'ADMIN' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  test('anonymous requests get 401', async () => {
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(401);
  });

  test('an admin can list users without password hashes or task contents', async () => {
    const admin = await registerAdmin();
    const user = await registerUser('listed');
    await request(app).post('/api/v1/tasks').set(bearer(user.accessToken)).send({ title: 'private title' });

    const response = await request(app).get('/api/v1/admin/users?limit=100').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    const listed = response.body.items.find((u) => u.email === user.email);
    expect(listed).toMatchObject({ role: 'USER', taskCount: 1 });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(/passwordHash|private title/);
  });

  test('users cannot escalate their own role', async () => {
    const user = await registerUser('escalate');
    const { id } = await prisma.user.findUnique({ where: { email: user.email } });
    const response = await request(app).patch(`/api/v1/admin/users/${id}/role`).set(bearer(user.accessToken))
      .send({ role: 'ADMIN' });
    expect(response.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id } })).role).toBe('USER');
  });

  test('an admin can promote another user, which revokes that user\'s sessions', async () => {
    const admin = await registerAdmin();
    const user = await registerUser('promoted');
    const { id } = await prisma.user.findUnique({ where: { email: user.email } });

    const response = await request(app).patch(`/api/v1/admin/users/${id}/role`).set(bearer(admin.accessToken))
      .send({ role: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(response.body.item.role).toBe('ADMIN');
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(refresh.status).toBe(401);
  });

  test('an admin cannot change their own role', async () => {
    const admin = await registerAdmin();
    const response = await request(app).patch(`/api/v1/admin/users/${admin.id}/role`).set(bearer(admin.accessToken))
      .send({ role: 'USER' });
    expect(response.status).toBe(400);
  });

  test('a demoted admin loses access immediately, even with an unexpired token', async () => {
    const admin = await registerAdmin();
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } });
    const response = await request(app).get('/api/v1/admin/users').set(bearer(admin.accessToken));
    expect(response.status).toBe(403);
  });

  test('admin role does not grant access to other users\' tasks', async () => {
    const admin = await registerAdmin();
    const user = await registerUser('victim');
    const created = await request(app).post('/api/v1/tasks').set(bearer(user.accessToken)).send({ title: 'mine' });
    const response = await request(app).get(`/api/v1/tasks/${created.body.item.id}`).set(bearer(admin.accessToken));
    expect(response.status).toBe(404);
  });

  test('an admin can read and filter audit events', async () => {
    const admin = await registerAdmin();
    const response = await request(app).get('/api/v1/admin/audit?action=auth.login').set(bearer(admin.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items.every((e) => e.action === 'auth.login')).toBe(true);
  });
});
