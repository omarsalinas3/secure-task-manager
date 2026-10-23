'use strict';

const {
  app, prisma, request, registerUser, bearer, cleanDatabase,
} = require('./helpers');

beforeAll(cleanDatabase);
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function createTask(token, body) {
  const response = await request(app).post('/api/v1/tasks').set(bearer(token)).send(body);
  expect(response.status).toBe(201);
  return response.body.item;
}

describe('task CRUD for the owner', () => {
  test('creates, reads, edits, completes, and deletes a task', async () => {
    const user = await registerUser('crud');
    const task = await createTask(user.accessToken, { title: '  Write tests  ', description: 'Jest + Supertest' });
    expect(task.title).toBe('Write tests');
    expect(task.completed).toBe(false);

    const fetched = await request(app).get(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken));
    expect(fetched.status).toBe(200);
    expect(fetched.body.item.id).toBe(task.id);

    const edited = await request(app).patch(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken))
      .send({ title: 'Write more tests', description: null, completed: true });
    expect(edited.status).toBe(200);
    expect(edited.body.item).toMatchObject({ title: 'Write more tests', description: null, completed: true });

    const removed = await request(app).delete(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken));
    expect(removed.status).toBe(204);

    const again = await request(app).get(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken));
    expect(again.status).toBe(404);
  });

  test('ignores a client-supplied ownerId', async () => {
    const owner = await registerUser('owner');
    const other = await registerUser('other');
    const otherId = (await prisma.user.findUnique({ where: { email: other.email } })).id;
    const task = await createTask(owner.accessToken, { title: 'Mine', ownerId: otherId });
    const ownerId = (await prisma.user.findUnique({ where: { email: owner.email } })).id;
    expect(task.ownerId).toBe(ownerId);
  });

  test.each([
    ['empty title', { title: '   ' }],
    ['title too long', { title: 'x'.repeat(121) }],
    ['description too long', { title: 'ok', description: 'x'.repeat(2001) }],
    ['wrong type', { title: 42 }],
  ])('rejects %s', async (_name, body) => {
    const user = await registerUser('invalid');
    const response = await request(app).post('/api/v1/tasks').set(bearer(user.accessToken)).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('rejects an empty update', async () => {
    const user = await registerUser('empty');
    const task = await createTask(user.accessToken, { title: 'Task' });
    const response = await request(app).patch(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken)).send({});
    expect(response.status).toBe(400);
  });

  test('malformed task IDs get a safe 400 without database details', async () => {
    const user = await registerUser('badid');
    for (const id of ['1', "x' OR '1'='1", 'C'.repeat(25)]) {
      const response = await request(app).delete(`/api/v1/tasks/${encodeURIComponent(id)}`)
        .set(bearer(user.accessToken));
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toMatch(/prisma|postgres|sql/i);
    }
  });
});

describe('cross-user authorization (IDOR)', () => {
  test('user A cannot read, update, or delete user B\'s task', async () => {
    const userA = await registerUser('idor-a');
    const userB = await registerUser('idor-b');
    const taskB = await createTask(userB.accessToken, { title: 'B private task' });

    const read = await request(app).get(`/api/v1/tasks/${taskB.id}`).set(bearer(userA.accessToken));
    const update = await request(app).patch(`/api/v1/tasks/${taskB.id}`).set(bearer(userA.accessToken))
      .send({ title: 'hijacked', completed: true });
    const remove = await request(app).delete(`/api/v1/tasks/${taskB.id}`).set(bearer(userA.accessToken));

    // 404 instead of 403 so attackers cannot even confirm the task exists.
    expect(read.status).toBe(404);
    expect(update.status).toBe(404);
    expect(remove.status).toBe(404);

    const stored = await prisma.task.findUnique({ where: { id: taskB.id } });
    expect(stored).toMatchObject({ title: 'B private task', completed: false });
  });

  test('user A\'s list never includes user B\'s tasks, even with search', async () => {
    const userA = await registerUser('list-a');
    const userB = await registerUser('list-b');
    await createTask(userB.accessToken, { title: 'secret shared-word' });
    await createTask(userA.accessToken, { title: 'mine shared-word' });

    const response = await request(app).get('/api/v1/tasks?q=shared-word').set(bearer(userA.accessToken));
    expect(response.status).toBe(200);
    expect(response.body.items.map((t) => t.title)).toEqual(['mine shared-word']);
    expect(response.body.total).toBe(1);
  });

  test('user A cannot use user B\'s task as a pagination cursor', async () => {
    const userA = await registerUser('cursor-a');
    const userB = await registerUser('cursor-b');
    const taskB = await createTask(userB.accessToken, { title: 'B' });
    const response = await request(app).get(`/api/v1/tasks?cursor=${taskB.id}`).set(bearer(userA.accessToken));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURSOR');
  });
});

describe('pagination, search, and filters', () => {
  let user;

  beforeAll(async () => {
    user = await registerUser('paging');
    for (let i = 1; i <= 7; i += 1) {
      await createTask(user.accessToken, { title: `Task ${i}`, description: i % 2 ? 'odd' : 'even' });
    }
    const list = await request(app).get('/api/v1/tasks?limit=100').set(bearer(user.accessToken));
    const [first, second] = list.body.items.filter((t) => t.description === 'odd');
    for (const task of [first, second]) {
      await request(app).patch(`/api/v1/tasks/${task.id}`).set(bearer(user.accessToken)).send({ completed: true });
    }
  });

  test.each([
    ['limit above maximum', 'limit=101'],
    ['limit zero', 'limit=0'],
    ['page zero', 'page=0'],
    ['non-numeric page', 'page=abc'],
    ['unknown status', 'status=archived'],
    ['malformed cursor', 'cursor=123'],
  ])('rejects %s', async (_name, query) => {
    const response = await request(app).get(`/api/v1/tasks?${query}`).set(bearer(user.accessToken));
    expect(response.status).toBe(400);
  });

  test('offset pages are bounded and report totals', async () => {
    const page1 = await request(app).get('/api/v1/tasks?page=1&limit=3').set(bearer(user.accessToken));
    const page3 = await request(app).get('/api/v1/tasks?page=3&limit=3').set(bearer(user.accessToken));
    expect(page1.body).toMatchObject({ page: 1, limit: 3, total: 7, hasMore: true });
    expect(page1.body.items).toHaveLength(3);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.hasMore).toBe(false);
  });

  test('cursor pages are stable when new tasks are inserted', async () => {
    const first = await request(app).get('/api/v1/tasks?limit=3').set(bearer(user.accessToken));
    await createTask(user.accessToken, { title: 'Inserted later' });
    const second = await request(app).get(`/api/v1/tasks?limit=3&cursor=${first.body.nextCursor}`)
      .set(bearer(user.accessToken));

    const firstIds = first.body.items.map((t) => t.id);
    const secondIds = second.body.items.map((t) => t.id);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    expect(second.body.items.map((t) => t.title)).not.toContain('Inserted later');
    expect(second.body.items[0].title).toBe('Task 4');
  });

  test('filters by completion status', async () => {
    const done = await request(app).get('/api/v1/tasks?status=completed').set(bearer(user.accessToken));
    const pending = await request(app).get('/api/v1/tasks?status=pending').set(bearer(user.accessToken));
    expect(done.body.total).toBe(2);
    expect(done.body.items.every((t) => t.completed)).toBe(true);
    expect(pending.body.items.every((t) => !t.completed)).toBe(true);
  });

  test('searches title and description case-insensitively', async () => {
    const byTitle = await request(app).get('/api/v1/tasks?q=TASK%205').set(bearer(user.accessToken));
    const byDescription = await request(app).get('/api/v1/tasks?q=EVEN').set(bearer(user.accessToken));
    expect(byTitle.body.items.map((t) => t.title)).toEqual(['Task 5']);
    expect(byDescription.body.total).toBe(3);
  });

  test('combines search and status filters', async () => {
    const response = await request(app).get('/api/v1/tasks?q=odd&status=pending').set(bearer(user.accessToken));
    expect(response.body.total).toBe(2);
  });
});
