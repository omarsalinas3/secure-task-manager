'use strict';

const {
  app, prisma, request, registerUser, bearer, cleanDatabase, PASSWORD,
} = require('./helpers');
const notifications = require('../src/services/notification.service');
const { REDACT_PATHS } = require('../src/utils/logger');

beforeAll(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const NEW_PASSWORD = 'another-long-test-password';

describe('password change', () => {
  test('requires the current password', async () => {
    const user = await registerUser('pw-wrong');
    const response = await request(app).post('/api/v1/auth/change-password').set(bearer(user.accessToken))
      .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD });
    expect(response.status).toBe(401);
  });

  test('rejects reusing the same password', async () => {
    const user = await registerUser('pw-same');
    const response = await request(app).post('/api/v1/auth/change-password').set(bearer(user.accessToken))
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(response.status).toBe(400);
  });

  test('revokes all existing sessions and returns a fresh pair', async () => {
    const user = await registerUser('pw-change');
    const otherDevice = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    const response = await request(app).post('/api/v1/auth/change-password').set(bearer(user.accessToken))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.refreshToken).toBeDefined();

    for (const token of [user.refreshToken, otherDevice.body.refreshToken]) {
      const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: token });
      expect(refresh.status).toBe(401);
    }
    const fresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: response.body.refreshToken });
    expect(fresh.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: NEW_PASSWORD });
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
  });
});

describe('session management', () => {
  test('lists sessions with device names and marks the current one', async () => {
    const user = await registerUser('sessions');
    await request(app).post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD, deviceName: 'Pixel 8' });

    const response = await request(app).get('/api/v1/auth/sessions').set(bearer(user.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items.filter((s) => s.current)).toHaveLength(1);
    expect(response.body.items.map((s) => s.deviceName)).toContain('Pixel 8');
    expect(JSON.stringify(response.body)).not.toMatch(/tokenHash|refreshToken/);
  });

  test('a rotated session stays one session with its original sign-in time', async () => {
    const user = await registerUser('rotated-session');
    const rotated = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    const response = await request(app).get('/api/v1/auth/sessions').set(bearer(rotated.body.accessToken));
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].current).toBe(true);
    expect(new Date(response.body.items[0].signedInAt) <= new Date(response.body.items[0].lastRefreshedAt))
      .toBe(true);
  });

  test('revokes one specific session', async () => {
    const user = await registerUser('revoke-one');
    const other = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const sessions = await request(app).get('/api/v1/auth/sessions').set(bearer(user.accessToken));
    const target = sessions.body.items.find((s) => !s.current);

    const revoke = await request(app).delete(`/api/v1/auth/sessions/${target.id}`).set(bearer(user.accessToken));
    expect(revoke.status).toBe(204);

    const refreshOther = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: other.body.refreshToken });
    const refreshMine = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(refreshOther.status).toBe(401);
    expect(refreshMine.status).toBe(200);
  });

  test('cannot revoke another user\'s session', async () => {
    const userA = await registerUser('sess-a');
    const userB = await registerUser('sess-b');
    const sessionsB = await request(app).get('/api/v1/auth/sessions').set(bearer(userB.accessToken));
    const response = await request(app).delete(`/api/v1/auth/sessions/${sessionsB.body.items[0].id}`)
      .set(bearer(userA.accessToken));
    expect(response.status).toBe(404);
    const refreshB = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: userB.refreshToken });
    expect(refreshB.status).toBe(200);
  });

  test('signs out all other sessions but keeps the current one', async () => {
    const user = await registerUser('others');
    const other = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const response = await request(app).delete('/api/v1/auth/sessions').set(bearer(user.accessToken));
    expect(response.status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: other.body.refreshToken })).status)
      .toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken })).status)
      .toBe(200);
  });
});

describe('account deletion', () => {
  test('requires the password', async () => {
    const user = await registerUser('del-wrong');
    const response = await request(app).delete('/api/v1/auth/account').set(bearer(user.accessToken))
      .send({ password: 'not-the-password' });
    expect(response.status).toBe(401);
    expect(await prisma.user.findUnique({ where: { email: user.email } })).not.toBeNull();
  });

  test('deletes the user, tasks, and tokens; keeps an anonymous audit trail', async () => {
    const user = await registerUser('del-ok');
    await request(app).post('/api/v1/tasks').set(bearer(user.accessToken)).send({ title: 'gone soon' });
    const { id } = await prisma.user.findUnique({ where: { email: user.email } });

    const response = await request(app).delete('/api/v1/auth/account').set(bearer(user.accessToken))
      .send({ password: PASSWORD });
    expect(response.status).toBe(204);

    expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.task.count({ where: { ownerId: id } })).toBe(0);
    expect(await prisma.refreshToken.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { userId: null, action: 'auth.account_delete' } }))
      .toBeGreaterThan(0);

    const login = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(401);
    // The still-unexpired access token can no longer create data.
    const create = await request(app).post('/api/v1/tasks').set(bearer(user.accessToken)).send({ title: 'x' });
    expect(create.status).toBe(401);
  });
});

describe('audit events', () => {
  test('records security events without personal data', async () => {
    const user = await registerUser('audit');
    await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'wrong-password' });
    await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });

    const response = await request(app).get('/api/v1/auth/audit').set(bearer(user.accessToken));
    expect(response.status).toBe(200);
    const actions = response.body.items.map((e) => `${e.action}:${e.outcome}`);
    expect(actions).toEqual(expect.arrayContaining([
      'auth.register:success', 'auth.login:failure', 'auth.login:success',
    ]));
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(user.email);
    expect(serialized).not.toContain(PASSWORD);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(['action', 'createdAt', 'id', 'outcome', 'userId']);
  });

  test('records refresh-token reuse', async () => {
    const user = await registerUser('audit-reuse');
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    const { id } = await prisma.user.findUnique({ where: { email: user.email } });
    expect(await prisma.auditEvent.count({ where: { userId: id, action: 'auth.refresh_reuse_detected' } })).toBe(1);
  });

  test('a token revoked by logout is rejected but not reported as reuse', async () => {
    const user = await registerUser('audit-stale');
    await request(app).post('/api/v1/auth/logout').send({ refreshToken: user.refreshToken });
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(refresh.status).toBe(401);
    const { id } = await prisma.user.findUnique({ where: { email: user.email } });
    expect(await prisma.auditEvent.count({ where: { userId: id, action: 'auth.refresh_reuse_detected' } })).toBe(0);
  });

  test('purges events older than the retention period', async () => {
    const audit = require('../src/services/audit.service');
    const old = await prisma.auditEvent.create({
      data: { action: 'auth.login', outcome: 'success', createdAt: new Date('2000-01-01') },
    });
    await audit.purgeExpired();
    expect(await prisma.auditEvent.findUnique({ where: { id: old.id } })).toBeNull();
  });
});

describe('push notification devices', () => {
  const pushToken = `fcm-test-token-${'a'.repeat(40)}`;

  test('registers a device and never returns the push token', async () => {
    const user = await registerUser('push');
    const response = await request(app).post('/api/v1/auth/devices').set(bearer(user.accessToken))
      .send({ pushToken, platform: 'android' });
    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain(pushToken);

    const list = await request(app).get('/api/v1/auth/devices').set(bearer(user.accessToken));
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(pushToken);
  });

  test('sends a sign-in notification to registered devices', async () => {
    const sent = [];
    notifications.setProvider({ async send(devices, message) { sent.push({ devices, message }); } });
    try {
      const user = await registerUser('push-login');
      const token = `fcm-login-token-${'b'.repeat(40)}`;
      await request(app).post('/api/v1/auth/devices').set(bearer(user.accessToken)).send({ pushToken: token, platform: 'ios' });
      await request(app).post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(sent).toHaveLength(1);
      expect(sent[0].message.title).toBe('New sign-in');
      expect(sent[0].devices[0].pushToken).toBe(token);
    } finally {
      notifications.setProvider({ async send() {} });
    }
  });

  test('unregisters only the caller\'s own device', async () => {
    const owner = await registerUser('push-owner');
    const attacker = await registerUser('push-attacker');
    const token = `fcm-owned-token-${'c'.repeat(40)}`;
    await request(app).post('/api/v1/auth/devices').set(bearer(owner.accessToken)).send({ pushToken: token, platform: 'web' });
    await request(app).post('/api/v1/auth/devices/unregister').set(bearer(attacker.accessToken)).send({ pushToken: token });
    expect(await prisma.deviceToken.count({ where: { pushToken: token } })).toBe(1);
    await request(app).post('/api/v1/auth/devices/unregister').set(bearer(owner.accessToken)).send({ pushToken: token });
    expect(await prisma.deviceToken.count({ where: { pushToken: token } })).toBe(0);
  });

  test('push tokens are redacted from request logs', () => {
    expect(REDACT_PATHS).toEqual(expect.arrayContaining(['req.body.pushToken', '*.pushToken']));
  });
});
