import { buildMovementSummary, recentWindow } from './core.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { wireLog } from './log.js';
import { wireToday } from './today.js';

const $ = (id) => document.getElementById(id);

export const state = {
  db: null, user: null, sample: null, uid: null,
  sessions: [], profile: { unit: 'kg', level: 'intermediate', about: '' },
  historyOk: false, workout: null, style: 'wod',
};

// ---------- small DOM helper (textContent only; never innerHTML with data) ----------
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const todayISO = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

export const historyContext = () => {
  const today = todayISO();
  const sessions = state.historyOk ? state.sessions : [];
  return { today, profile: state.profile, recent: recentWindow(sessions, today), summary: buildMovementSummary(sessions, state.profile.unit) };
};

export function show(el, text) {
  if (typeof el === 'string') el = $(el);
  if (text != null) el.textContent = text;
  el.hidden = false;
}
export const hide = (id) => { $(id).hidden = true; };

function setBanner(text, isError = false) {
  const b = $('banner');
  b.textContent = text;
  b.classList.toggle('error', isError);
  b.hidden = !text;
}

// ---------- rendering: workout blocks (shared by Today card, Log preview, History) ----------
const dose = (m) => {
  const parts = [];
  if (m.sets != null && m.reps != null) parts.push(`${m.sets}×${m.reps}`);
  else if (m.reps != null) parts.push(String(m.reps));
  else if (m.sets != null) parts.push(`${m.sets} sets`);
  if (m.load != null) parts.push(`@ ${m.load}${m.unit ?? ''}`);
  return parts.join(' ');
};

export function renderBlocks(blocks) {
  return blocks.map((b) => h('div', { class: 'block' },
    h('div', { class: 'block-head' },
      h('span', { class: 'block-name' }, b.name),
      b.format ? h('span', { class: 'block-format' }, b.format) : null,
      b.result ? h('span', { class: 'block-result' }, b.result) : null),
    h('ul', { class: 'moves' }, b.movements.map((m) => h('li', {},
      h('span', { class: 'move-name' }, m.name),
      h('span', { class: 'move-dose' }, dose(m)),
      m.note ? h('span', { class: 'move-note' }, m.note) : null)))));
}

export function renderWorkoutCard(w, { example = false } = {}) {
  return h('article', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: example ? 'tag example' : 'tag' }, example ? t('example') : styleLabel(w.style)),
      h('h2', { class: 'card-title' }, w.title),
      w.rationale ? h('p', { class: 'rationale' }, w.rationale) : null),
    renderBlocks(w.blocks));
}

const styleLabel = (s) => t('style' + s.charAt(0).toUpperCase() + s.slice(1));

// Shown before the first workout is designed, clearly marked as an example.
const EXAMPLE = {
  title: 'Back & pull', style: 'strength', rationale: t('exampleNote'),
  blocks: [
    { name: 'Warm-up', format: '8 min', movements: [{ name: 'Row', reps: '500m', sets: null, load: null, unit: null, note: 'easy pace' }, { name: 'Band pull-apart', sets: 2, reps: 15, load: null, unit: null, note: null }] },
    { name: 'Strength', format: '5x5', movements: [{ name: 'Pendlay row', sets: 5, reps: 5, load: 70, unit: 'kg', note: 'last: 65kg x5 on 2026-11-02' }] },
    { name: 'Metcon', format: 'AMRAP 12', movements: [{ name: 'Pull-up', sets: null, reps: 8, load: null, unit: null, note: null }, { name: 'Kettlebell swing', sets: null, reps: 12, load: 24, unit: 'kg', note: null }] },
    { name: 'Cooldown', format: '5 min', movements: [{ name: 'Lat stretch', sets: null, reps: '1 min/side', load: null, unit: null, note: null }] },
  ],
};

export function renderToday() {
  const card = $('card');
  card.replaceChildren(state.workout ? renderWorkoutCard(state.workout) : renderWorkoutCard(EXAMPLE, { example: true }));
  $('after').hidden = !state.workout;
  $('doneRow').hidden = !(state.db && state.uid);
}

// ---------- History ----------
export function renderHistory() {
  const list = $('historyList');
  $('historyEmpty').hidden = state.sessions.length > 0;
  $('historyCount').textContent = state.sessions.length ? t('lastSessions', state.sessions.length) : '';
  list.replaceChildren(...state.sessions.map((s) => {
    const del = h('button', { class: 'secondary danger', type: 'button' }, t('deleteSession'));
    let armed = null;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = t('confirmDelete');
        armed = setTimeout(() => { armed = null; del.textContent = t('deleteSession'); }, 3000);
        return;
      }
      clearTimeout(armed);
      del.disabled = true;
      try {
        await store.deleteSession(state.db, state.uid, s.id);
        state.sessions = state.sessions.filter((x) => x.id !== s.id);
        renderHistory();
      } catch (e) {
        del.disabled = false;
        setBanner(t('failed') + (e?.message ?? e), true);
      }
    });
    return h('li', {}, h('details', {},
      h('summary', {},
        h('span', { class: 'h-date' }, s.date),
        h('span', { class: 'h-title' }, s.title || s.blocks?.[0]?.movements?.[0]?.name || '—'),
        h('span', { class: 'h-style' }, styleLabel(s.style || 'other'))),
      h('div', { class: 'h-body' },
        renderBlocks(s.blocks ?? []),
        s.notes ? h('p', { class: 'msg' }, s.notes) : null,
        state.db ? h('div', { class: 'row' }, del) : null)));
  }));
}

export async function reloadSessions() {
  state.sessions = await store.loadSessions(state.db, state.uid);
  state.historyOk = true;
  renderHistory();
}

function renderProfile() {
  $('unitSel').value = state.profile.unit;
  $('levelSel').value = state.profile.level;
  $('aboutInput').value = state.profile.about;
}

function wireProfile() {
  $('saveProfileBtn').addEventListener('click', async () => {
    const profile = { unit: $('unitSel').value, level: $('levelSel').value, about: $('aboutInput').value.trim() };
    state.profile = profile;
    if (!state.db || !state.uid) return show('profileMsg', t('signIn'));
    try {
      await store.saveProfile(state.db, state.uid, profile);
      show('profileMsg', t('profileSaved'));
      renderHistory();
    } catch (e) {
      show('profileMsg', t('failed') + (e?.message ?? e));
    }
  });
}

// ---------- Shell ----------
function applyStrings() {
  document.documentElement.lang = t('tabToday') === 'Today' ? 'en' : 'zh';
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  $('todayDate').textContent = todayISO();
}

function wireTabs() {
  const tabs = [...document.querySelectorAll('nav.tabs button')];
  const select = (name) => {
    for (const b of tabs) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      $('panel-' + b.dataset.tab).hidden = !on;
    }
    try { localStorage.setItem('woder.tab', name); } catch { /* storage unavailable */ }
  };
  for (const b of tabs) b.addEventListener('click', () => select(b.dataset.tab));
  let saved = null;
  try { saved = localStorage.getItem('woder.tab'); } catch { /* storage unavailable */ }
  if (saved && $('panel-' + saved)) select(saved);
}

export function setAiAvailable(on) {
  for (const el of document.querySelectorAll('.ai-only')) el.hidden = !on;
}

const use = (name) => (window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));

async function start() {
  applyStrings();
  wireTabs();
  wireProfile();
  wireLog();
  wireToday();
  renderToday();
  renderHistory();

  const [db, user, sample] = await Promise.all([use('db'), use('user'), use('sample')]);
  Object.assign(state, { db, user, sample });
  state.uid = user ? await user.id().catch(() => null) : null;

  if (!sample) { setAiAvailable(false); setBanner(t('noAi')); }
  if (!db || !state.uid) {
    state.db = null;
    setBanner(t('signIn'));
    renderToday();
    return;
  }
  renderToday();
  try {
    const profile = await store.loadProfile(db, state.uid);
    if (profile) state.profile = { ...state.profile, ...profile };
    renderProfile();
    await reloadSessions();
  } catch {
    setBanner(t('historyFailed'), true);
  }
}

start();
