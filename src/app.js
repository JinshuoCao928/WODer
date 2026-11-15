import { buildMovementSummary, recentWindow, resultText } from './core.js';
import * as store from './store.js';
import { t, getLang, setLang } from './i18n.js';
import { wireLog, titleForBlock, styleForLayout, renderPending } from './log.js';
import { openForm } from './logform.js';
import { wireToday } from './today.js';

const $ = (id) => document.getElementById(id);

export const state = {
  db: null, user: null, sample: null, uid: null,
  sessions: [], profile: { unit: 'kg', distance: 'metric', level: 'intermediate', about: '' },
  historyOk: false, workout: null,
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
  const records = sessions.flatMap((s) => (s.blocks ?? []).filter((b) => b.type === 'pr' && b.movements?.[0])
    .map((b) => `${b.movements[0].name} ${resultText(b) ?? ''}`.trim() + (s.date ? ` (${s.date})` : '')));
  return { today, lang: getLang(), distance: state.profile.distance, profile: state.profile, records, recent: recentWindow(sessions, today), summary: buildMovementSummary(sessions, state.profile.unit) };
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
  if (m.distance) parts.push(m.distance);
  if (m.time) parts.push(m.time);
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
      m.note ? h('span', { class: 'move-note' }, m.note) : null))),
    b.note ? h('p', { class: 'msg' }, b.note) : null));
}

export function renderWorkoutCard(w) {
  return h('article', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: 'tag' }, styleLabel(w.style)),
      h('h2', { class: 'card-title' }, w.title),
      w.rationale ? h('p', { class: 'rationale' }, w.rationale) : null),
    renderBlocks(w.blocks));
}

const styleLabel = (s) => t('style' + s.charAt(0).toUpperCase() + s.slice(1));

export function renderToday() {
  const card = $('card');
  card.replaceChildren(state.workout ? renderWorkoutCard(state.workout) : h('div', { class: 'empty' }, t('emptyToday')));
  $('after').hidden = !state.workout;
  $('doneRow').hidden = !(state.db && state.uid);
}

// ---------- History ----------
export function renderHistory() {
  const list = $('historyList');
  $('historyEmpty').hidden = state.sessions.length > 0;
  $('historyCount').textContent = state.sessions.length ? t('lastSessions', state.sessions.length) : '';
  const firstUndated = state.sessions.findIndex((s) => s.date == null);
  list.replaceChildren(...state.sessions.flatMap((s, si) => {
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
        if (isReadOnlyError(e)) return markReadOnly();
        del.disabled = false;
        setBanner(t('failed') + (e?.message ?? e), true);
      }
    });
    // Each block can be edited on its own; the session date is edited with it.
    const blocks = (s.blocks ?? []).map((b, i) => {
      const slot = h('div', {}, renderBlocks([b]));
      if (state.db) slot.append(h('div', { class: 'row' }, h('button', { type: 'button', class: 'secondary', onclick: () =>
        openForm(slot, { block: b, date: s.date, submitLabel: t('saveChanges'), onCancel: renderHistory,
          onSubmit: async ({ date, block }) => {
            const updated = { ...s, date, blocks: s.blocks.map((x, j) => (j === i ? block : x)) };
            if (s.blocks.length === 1) Object.assign(updated, { title: titleForBlock(block), style: styleForLayout(block.type) });
            try {
              await store.updateSession(state.db, state.uid, s.id, updated);
              setBanner('');
              await reloadSessions();
            } catch (e) {
              if (isReadOnlyError(e)) return markReadOnly();
              setBanner(t('saveFailed'), true); // the form stays open; Save changes again retries
            }
          } }) }, t('editCard'))));
      return slot;
    });
    const group = si === firstUndated ? h('li', { class: 'history-group' }, t('dateUnknown')) : null;
    return [group, h('li', {}, h('details', {},
      h('summary', {},
        h('span', { class: 'h-date' }, s.date ?? '—'),
        h('span', { class: 'h-title' }, s.title || s.blocks?.[0]?.movements?.[0]?.name || '—'),
        h('span', { class: 'h-style' }, styleLabel(s.style || 'other'))),
      h('div', { class: 'h-body' },
        blocks,
        s.notes ? h('p', { class: 'msg' }, s.notes) : null,
        state.db ? h('div', { class: 'row' }, del) : null)))].filter(Boolean);
  }));
}

export async function reloadSessions() {
  state.sessions = await store.loadSessions(state.db, state.uid);
  state.historyOk = true;
  renderHistory();
}

function renderProfile() {
  $('levelSel').value = state.profile.level;
  $('aboutInput').value = state.profile.about;
}

function wireProfile() {
  $('saveProfileBtn').addEventListener('click', async () => {
    state.profile = { ...state.profile, level: $('levelSel').value, about: $('aboutInput').value.trim() };
    if (!state.db || !state.uid) return show('profileMsg', t('signIn'));
    try {
      await store.saveProfile(state.db, state.uid, state.profile);
      show('profileMsg', t('profileSaved'));
      renderHistory();
    } catch (e) {
      if (isReadOnlyError(e)) return markReadOnly();
      show('profileMsg', t('failed') + (e?.message ?? e));
    }
  });
}

// ---------- Shell ----------
function applyStrings() {
  document.documentElement.lang = getLang();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  $('langBtn').textContent = t('langSwitch');
  $('langBtn').lang = getLang() === 'zh' ? 'en' : 'zh';
  $('todayDate').textContent = todayISO();
  renderUnits();
}

function renderUnits() {
  for (const b of document.querySelectorAll('#unitSeg button')) b.setAttribute('aria-pressed', String(b.dataset.unit === state.profile.unit));
  for (const b of document.querySelectorAll('#distSeg button')) b.setAttribute('aria-pressed', String(b.dataset.dist === state.profile.distance));
}

// Corner switches: language (this device only) and units (saved in the profile when signed in).
function wireToggles() {
  $('langBtn').addEventListener('click', () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    applyStrings();
    renderToday();
    renderHistory();
    renderPending();
  });
  const saveUnits = async (change) => {
    state.profile = { ...state.profile, ...change };
    renderUnits();
    if (!state.db || !state.uid) return;
    try { await store.saveProfile(state.db, state.uid, state.profile); } catch (e) { if (isReadOnlyError(e)) markReadOnly(); }
  };
  for (const b of document.querySelectorAll('#unitSeg button')) b.addEventListener('click', () => saveUnits({ unit: b.dataset.unit }));
  for (const b of document.querySelectorAll('#distSeg button')) b.addEventListener('click', () => saveUnits({ distance: b.dataset.dist }));
}

export let selectTab = () => {};

function wireTabs() {
  const tabs = [...document.querySelectorAll('nav.tabs button')];
  const select = selectTab = (name) => {
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

// A view-only member has a uid but every write to data/users/<uid>/ rejects invalid_argument (db.d.ts).
export const isReadOnlyError = (e) => e?.code === 'invalid_argument';
export function markReadOnly() {
  state.db = null;
  setBanner(t('viewOnly'));
  renderToday();
  renderHistory();
}

export function setAiAvailable(on) {
  for (const el of document.querySelectorAll('.ai-only')) el.hidden = !on;
}

const use = (name) => (window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null));

async function start() {
  applyStrings();
  wireTabs();
  wireProfile();
  wireToggles();
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
    renderUnits();
    await reloadSessions();
    if (state.sessions.length === 0) { selectTab('log'); show('welcome'); }
  } catch {
    setBanner(t('historyFailed'), true);
  }
}

start();
