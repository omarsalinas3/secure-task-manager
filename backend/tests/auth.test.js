'use strict';

const {
  app, prisma, request, uniqueEmail, registerUser, bearer, cleanDatabase, PASSWORD,
} = require('./helpers');

beforeAll(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('registration', () => {
  test('creates an account, stores only a password hash, and returns a token pair', async () => {
    const email = uniqueEmail('reg');
    const response = await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });

    expect(response.status).toBe(201);
    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
    expect(response.body.expiresIn).toBe(600);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.passwordHash.startsWith('$2b$12$')).toBe(true);
    expect(user.role).toBe('USER');
  });

  test('normalizes email case and rejects duplicates with 409', async () => {
    const email = uniqueEmail('dup');
    await request(app).post('/api/v1/auth/register').send({ email, password: PASSWORD });
    const response = await request(app).post('/api/v1/auth/register')
      .send({ email: `  ${email.toUpperCase()} `, password: PASSWORD });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  test.each([
    ['short password', { password: 'short' }],
    ['invalid email', { email: 'not-an-email' }],
    ['common password', { password: 'password1234' }],
    ['missing fields', { email: undefined, password: undefined }],
  ])('rejects %s with a validation error', async (_name, override) => {
    const body = { email: uniqueEmail('bad'), password: PASSWORD, ...override };
    const response = await request(app).post('/api/v1/auth/register').send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('stores refresh tokens only as SHA-256 hashes', async () => {
    const user = await registerUser('hash');
    const rows = await prisma.refreshToken.findMany({ where: { user: { email: user.email } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].tokenHash).not.toBe(user.refreshToken);
  });
});

describe('login', () => {
  test('returns tokens for correct credentials', async () => {
    const user = await registerUser('login');
    const response = await request(app).post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
  });

  test('uses the same generic message for a wrong password and an unknown email', async () => {
    const user = await registerUser('generic');
    const wrongPassword = await request(app).post('/api/v1/auth/login')
      .send({ email: user.email, password: 'definitely-not-it' });
    const unknownEmail = await request(app).post('/api/v1/auth/login')
      .send({ email: uniqueEmail('ghost'), password: 'definitely-not-it' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
  });

  test('rate-limits repeated login attempts', async () => {
    const email = uniqueEmail('limited');
    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await request(app).post('/api/v1/auth/login')
        .set('x-test-enforce-rate-limit', '1')
        .send({ email, password: 'wrong-password' });
    }
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('access tokens', () => {
  test('protected routes require a bearer token', async () => {
    const response = await request(app).get('/api/v1/tasks');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('rejects a tampered token', async () => {
    const user = await registerUser('tamper');
    const [header, payload, signature] = user.accessToken.split('.');
    const forged = `${header}.${payload}.${signature.slice(0, -2)}xx`;
    const response = await request(app).get('/api/v1/tasks').set(bearer(forged));
    expect(response.status).toBe(401);
  });

  test('rejects a refresh token used as an access token', async () => {
    const user = await registerUser('confused');
    const response = await request(app).get('/api/v1/tasks').set(bearer(user.refreshToken));
    expect(response.status).toBe(401);
  });

  test('/auth/me returns the profile without the password hash', async () => {
    const user = await registerUser('me');
    const response = await request(app).get('/api/v1/auth/me').set(bearer(user.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(user.email);
    expect(response.body.user.passwordHash).toBeUndefined();
  });
});

describe('safe error responses', () => {
  test('malformed JSON returns 400 without parser internals', async () => {
    const response = await request(app).post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError|at JSON|node_modules/);
  });

  test('oversized bodies are rejected', async () => {
    const response = await request(app).post('/api/v1/auth/login')
      .send({ email: 'a@example.test', password: 'x'.repeat(30 * 1024) });
    expect(response.status).toBe(413);
  });
});
