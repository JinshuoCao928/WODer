// Log tab: free text (one day or many) -> Claude parses -> athlete checks the preview -> save.
import { buildParsePrompt, buildMovementSummary, validateSessionList } from './core.js';
import { askJson, errorKey } from './claude.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { state, h, show, hide, renderBlocks, reloadSessions, setAiAvailable, todayISO, isReadOnlyError, markReadOnly } from './app.js';

const $ = (id) => document.getElementById(id);
let parsed = null; // sessions still waiting to be saved

export const knownMovements = () => Object.keys(buildMovementSummary(state.historyOk ? state.sessions : [], state.profile.unit));

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

function clearPreview() {
  parsed = null;
  hide('logPreview'); hide('logActions');
  $('logSaveBtn').textContent = t('save');
}

async function readIt() {
  const text = $('logInput').value.trim();
  if (!text || !state.sample) return;
  const btn = $('previewBtn');
  hide('logError'); hide('logOk'); clearPreview();
  btn.disabled = true; btn.textContent = t('reading');
  try {
    const sessions = await parseSessions(text);
    if ($('logInput').value.trim() !== text) return; // text was edited while Claude was reading it
    parsed = sessions;
    $('logPreview').replaceChildren(h('p', { class: 'msg' }, t('checkPreview')), ...sessions.map((s) => h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('span', { class: 'tag' }, s.date),
        h('h2', { class: 'card-title' }, s.title || s.blocks[0].movements[0]?.name || '')),
      renderBlocks(s.blocks),
      s.notes ? h('p', { class: 'msg' }, s.notes) : null)));
    show('logPreview');
    $('logActions').hidden = false;
    $('logSaveBtn').hidden = !(state.db && state.uid);
  } catch (e) {
    showError('logError', e, 'log');
  } finally {
    btn.disabled = false; btn.textContent = t('preview');
  }
}

async function save() {
  if (!parsed || !state.db) return;
  const btn = $('logSaveBtn');
  btn.disabled = true; hide('logError');
  const rawText = $('logInput').value.trim();
  const total = parsed.length;
  try {
    while (parsed.length) { // shift only after a successful write, so Retry never saves a session twice
      await store.saveSession(state.db, state.uid, { ...parsed[0], source: 'logged', rawText });
      parsed.shift();
    }
    $('logInput').value = '';
    clearPreview();
    hide('welcome');
    show('logOk', total > 1 ? t('savedN', total) : t('saved'));
    await reloadSessions().catch(() => {});
  } catch (e) {
    if (isReadOnlyError(e)) { clearPreview(); markReadOnly(); return; }
    show('logError', t('saveFailed'));
    btn.textContent = t('retry');
  } finally {
    btn.disabled = false;
  }
}

export function wireLog() {
  $('previewBtn').addEventListener('click', readIt);
  $('logSaveBtn').addEventListener('click', save);
  $('logEditBtn').addEventListener('click', () => { clearPreview(); $('logInput').focus(); });
  $('logInput').addEventListener('input', () => { if (parsed) clearPreview(); hide('logOk'); });
}
