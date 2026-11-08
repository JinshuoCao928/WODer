// Private per-athlete storage. Everything lives under data/users/<uid>/, which only that viewer can read or write.
// Paths: profile = data/users/<uid>/profile (doc); sessions = data/users/<uid>/profile/sessions/<sid>.

export const DB_TIMEOUT_MS = 10000;

const profilePath = (uid) => `data/users/${uid}/profile`;
export const sessionsPath = (uid) => `${profilePath(uid)}/sessions`;

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

// Strip undefined values: the store only accepts plain JSON.
const plain = (obj) => JSON.parse(JSON.stringify(obj));

export async function loadSessions(db, uid, { timeoutMs = DB_TIMEOUT_MS } = {}) {
  const snap = await withTimeout(db.collection(sessionsPath(uid)).orderBy('date', 'desc').get(), timeoutMs);
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function saveSession(db, uid, session) {
  const id = crypto.randomUUID();
  const { id: _ignored, ...body } = session;
  await db.collection(sessionsPath(uid)).doc(id).set(plain({ ...body, createdAt: Date.now() }));
  return id;
}

export async function deleteSession(db, uid, id) {
  await db.collection(sessionsPath(uid)).doc(id).delete();
}

export async function loadProfile(db, uid, { timeoutMs = DB_TIMEOUT_MS } = {}) {
  const snap = await withTimeout(db.doc(profilePath(uid)).get(), timeoutMs);
  return snap.exists ? snap.data() : null;
}

export async function saveProfile(db, uid, profile) {
  await db.doc(profilePath(uid)).set(plain(profile));
}
