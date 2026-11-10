import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSessions, saveSession, updateSession, deleteSession, loadProfile, saveProfile, sessionsPath } from '../src/store.js';

// Minimal in-memory stand-in for the artifact db: only what store.js uses.
function fakeDb({ hang = false } = {}) {
  const docs = new Map();
  const snap = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) });
  const docRef = (path) => ({
    id: path.split('/').pop(), path,
    get: async () => snap(path),
    set: async (d) => { docs.set(path, structuredClone(d)); },
    delete: async () => { docs.delete(path); },
    collection: (name) => colRef(path + '/' + name),
  });
  const colRef = (path) => {
    const q = (order) => ({
      orderBy: (f, dir) => q({ f, dir }),
      get: () => hang ? new Promise(() => {}) : Promise.resolve((() => {
        let ds = [...docs.keys()].filter((k) => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1).map(snap);
        if (order) ds.sort((a, b) => (a.data()[order.f] < b.data()[order.f] ? -1 : 1) * (order.dir === 'desc' ? -1 : 1));
        return { docs: ds, size: ds.length, empty: !ds.length };
      })()),
    });
    return { path, doc: (id) => docRef(path + '/' + id), ...q(null) };
  };
  return { docs, doc: docRef, collection: colRef };
}

test('sessions live under the private profile doc', () => {
  assert.equal(sessionsPath('u1'), 'data/users/u1/profile/sessions');
});

test('save then load returns newest first with id and createdAt', async () => {
  const db = fakeDb();
  const a = await saveSession(db, 'u1', { date: '2026-11-01', title: 'A' });
  await saveSession(db, 'u1', { date: '2026-11-05', title: 'B' });
  assert.ok(db.docs.has(`data/users/u1/profile/sessions/${a}`));
  const list = await loadSessions(db, 'u1');
  assert.deepEqual(list.map((s) => s.title), ['B', 'A']);
  assert.equal(typeof list[0].createdAt, 'number');
  assert.equal(list[1].id, a);
});

test('delete removes a session', async () => {
  const db = fakeDb();
  const id = await saveSession(db, 'u1', { date: '2026-11-01' });
  await deleteSession(db, 'u1', id);
  assert.deepEqual(await loadSessions(db, 'u1'), []);
});

test('loadSessions times out', async () => {
  await assert.rejects(loadSessions(fakeDb({ hang: true }), 'u1', { timeoutMs: 20 }), /timeout/);
});

test('profile round trip and missing profile is null', async () => {
  const db = fakeDb();
  assert.equal(await loadProfile(db, 'u1'), null);
  await saveProfile(db, 'u1', { unit: 'lb', level: 'advanced', about: 'x' });
  assert.deepEqual(await loadProfile(db, 'u1'), { unit: 'lb', level: 'advanced', about: 'x' });
});

test('undated sessions come back last', async () => {
  const db = fakeDb();
  await saveSession(db, 'u1', { date: null, title: 'U' });
  await saveSession(db, 'u1', { date: '2026-11-01', title: 'A' });
  await saveSession(db, 'u1', { date: '2026-11-05', title: 'B' });
  assert.deepEqual((await loadSessions(db, 'u1')).map((s) => s.title), ['B', 'A', 'U']);
});

test('updateSession keeps id and createdAt, sets updatedAt', async () => {
  const db = fakeDb();
  const id = await saveSession(db, 'u1', { date: '2026-11-01', title: 'A' });
  const [saved] = await loadSessions(db, 'u1');
  await updateSession(db, 'u1', id, { ...saved, createdAt: 5, title: 'B' });
  const doc = db.docs.get(`data/users/u1/profile/sessions/${id}`);
  assert.equal(doc.title, 'B');
  assert.equal(doc.createdAt, 5);
  assert.equal(typeof doc.updatedAt, 'number');
  assert.equal('id' in doc, false);
});
