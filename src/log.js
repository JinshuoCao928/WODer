// Log tab: free text -> Claude parses -> athlete checks the preview -> save.
import { buildParsePrompt, buildMovementSummary, validateSession } from './core.js';
import { askJson, errorKey } from './claude.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { state, h, show, hide, renderBlocks, reloadSessions, setAiAvailable, todayISO } from './app.js';

const $ = (id) => document.getElementById(id);
let parsed = null;

export const knownMovements = () => Object.keys(buildMovementSummary(state.historyOk ? state.sessions : [], state.profile.unit));

export function showError(id, e, kind) {
  const key = errorKey(e, kind);
  if (!key) return;
  if (key === 'noAi') setAiAvailable(false);
  show(id, key === 'failed' ? t('failed') + (e?.message ?? e?.code ?? e) : t(key));
}

function clearPreview() {
  parsed = null;
  hide('logPreview'); hide('logActions');
}

async function readIt() {
  const text = $('logInput').value.trim();
  if (!text || !state.sample) return;
  const btn = $('previewBtn');
  hide('logError'); hide('logOk'); clearPreview();
  btn.disabled = true; btn.textContent = t('reading');
  try {
    parsed = await askJson(state.sample,
      buildParsePrompt({ text, today: todayISO(), unit: state.profile.unit, knownMovements: knownMovements() }),
      validateSession, { modelTier: 'quick' });
    $('logPreview').replaceChildren(h('article', { class: 'card' },
      h('div', { class: 'card-head' },
        h('span', { class: 'tag' }, parsed.date),
        h('h2', { class: 'card-title' }, parsed.title || parsed.blocks[0].movements[0]?.name || ''),
        h('p', { class: 'rationale' }, t('checkPreview'))),
      renderBlocks(parsed.blocks),
      parsed.notes ? h('p', { class: 'msg' }, parsed.notes) : null));
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
  try {
    await store.saveSession(state.db, state.uid, { ...parsed, source: 'logged', rawText: $('logInput').value.trim() });
    $('logInput').value = '';
    clearPreview();
    show('logOk', t('saved'));
    await reloadSessions().catch(() => {});
  } catch {
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
