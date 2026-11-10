// Log tab: workouts come in by typing (Claude splits them) or by the form, wait as editable cards, then Save all.
import { buildParsePrompt, buildMovementSummary, validateSessionList } from './core.js';
import { askJson, errorKey } from './claude.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { MOVEMENTS } from './library.js';
import { openForm } from './logform.js';
import { state, h, show, hide, renderBlocks, reloadSessions, setAiAvailable, todayISO, isReadOnlyError, markReadOnly } from './app.js';

const $ = (id) => document.getElementById(id);
let pending = []; // [{date, block}] waiting to be saved; an entry leaves only after its write succeeds

// Library names first, then any of the athlete's own names the library doesn't have.
export const knownMovements = () => [...new Set([...MOVEMENTS.map((m) => m.name),
  ...Object.keys(buildMovementSummary(state.historyOk ? state.sessions : [], state.profile.unit))])];

// Ask Claude to turn free text into validated sessions (used by Log and by Mark done).
export const parseSessions = (text, opts = {}) => askJson(state.sample,
  buildParsePrompt({ text, today: todayISO(), unit: state.profile.unit, knownMovements: knownMovements() }),
  (o) => validateSessionList(o, state.profile.unit), { modelTier: 'quick', ...opts });

export function showError(id, e, kind) {
  const key = errorKey(e, kind);
  if (!key) return;
  if (key === 'noAi') setAiAvailable(false);
  show(id, key === 'failed' ? t('failed') + (e?.message ?? e?.code ?? e) : t(key));
}

const STYLE_FOR_LAYOUT = { strength: 'strength', pr: 'strength', amrap: 'wod', fortime: 'wod', intervals: 'wod', other: 'other' };
export const styleForLayout = (type) => STYLE_FOR_LAYOUT[type] ?? 'other';
export const titleForBlock = (b) => b.benchmark || (b.type === 'pr' && b.movements[0] ? `${b.movements[0].name} PR` : null)
  || b.format || b.movements[0]?.name || '';

export function entryCard({ date, block }, actions) {
  return h('article', { class: 'card' },
    h('div', { class: 'card-head' },
      h('span', { class: 'tag' }, date ?? t('dateUnknown')),
      h('h2', { class: 'card-title' }, titleForBlock(block))),
    renderBlocks([block]),
    h('div', { class: 'card-actions' }, actions));
}

function renderPending() {
  const list = $('pendingList');
  list.replaceChildren(...pending.map((entry, i) => {
    const slot = h('div', {});
    const edit = () => openForm(slot, { block: entry.block, date: entry.date, submitLabel: t('doneEditing'),
      onSubmit: (next) => { pending[i] = next; renderPending(); }, onCancel: renderPending });
    slot.append(entryCard(entry, [
      h('button', { type: 'button', class: 'secondary', onclick: edit }, t('editCard')),
      h('button', { type: 'button', class: 'secondary danger', onclick: () => { pending.splice(i, 1); renderPending(); } }, t('removeCard')),
    ]));
    return slot;
  }));
  $('logActions').hidden = pending.length === 0;
  $('logSaveAllBtn').hidden = !(state.db && state.uid);
  $('logSaveAllBtn').textContent = t('saveAll');
}

async function readIt() {
  const text = $('logInput').value.trim();
  if (!text || !state.sample) return;
  const btn = $('previewBtn');
  hide('logError'); hide('logOk');
  btn.disabled = true; btn.textContent = t('reading');
  try {
    const sessions = await parseSessions(text);
    if ($('logInput').value.trim() !== text) return; // text was edited while Claude was reading it
    for (const s of sessions) for (const block of s.blocks) pending.push({ date: s.date, block });
    $('logInput').value = '';
    renderPending();
  } catch (e) {
    showError('logError', e, 'log');
  } finally {
    btn.disabled = false; btn.textContent = t('preview');
  }
}

function openAddForm() {
  const box = $('logFormBox');
  box.hidden = false;
  openForm(box, { submitLabel: t('addToList'),
    onSubmit: (entry) => { pending.push(entry); box.hidden = true; box.replaceChildren(); renderPending(); },
    onCancel: () => { box.hidden = true; box.replaceChildren(); } });
}

async function saveAll() {
  if (!pending.length || !state.db) return;
  const btn = $('logSaveAllBtn');
  btn.disabled = true; hide('logError');
  const total = pending.length;
  try {
    while (pending.length) {
      const { date, block } = pending[0];
      await store.saveSession(state.db, state.uid, { date, source: 'logged', style: styleForLayout(block.type),
        title: titleForBlock(block), focus: [], blocks: [block], rpe: null, notes: null, rawText: '' });
      pending.shift();
    }
    renderPending();
    hide('welcome');
    show('logOk', total > 1 ? t('savedN', total) : t('saved'));
    await reloadSessions().catch(() => {});
  } catch (e) {
    renderPending();
    if (isReadOnlyError(e)) { markReadOnly(); return; }
    show('logError', t('saveFailed'));
    btn.textContent = t('retry');
  } finally {
    btn.disabled = false;
  }
}

export function wireLog() {
  $('previewBtn').addEventListener('click', readIt);
  $('addFormBtn').addEventListener('click', openAddForm);
  $('logSaveAllBtn').addEventListener('click', saveAll);
  $('logInput').addEventListener('input', () => hide('logOk'));
}
