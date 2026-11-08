// Today tab: design a workout from history + today's request, revise it, mark it done.
import { buildGeneratePrompt, buildRevisePrompt, buildParsePrompt, validateWorkout, validateSession } from './core.js';
import { askJson } from './claude.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { state, show, hide, renderToday, reloadSessions, historyContext } from './app.js';
import { showError, knownMovements } from './log.js';

const $ = (id) => document.getElementById(id);
let ctrl = null;

async function design(buildPrompt, btn, label) {
  ctrl?.abort();
  const mine = (ctrl = new AbortController());
  const ctx = historyContext();
  hide('todayError');
  const noHistory = !state.historyOk || state.sessions.length === 0;
  if (noHistory) show('todayNote', state.historyOk || !state.db ? t('estimates') : t('historyFailed'));
  else hide('todayNote');
  const progress = $('progress');
  progress.textContent = '';
  progress.hidden = false;
  btn.disabled = true; btn.textContent = t('generating');
  try {
    const workout = await askJson(state.sample, buildPrompt(ctx), validateWorkout, {
      modelTier: 'default', signal: mine.signal,
      onText: ({ text }) => { if (ctrl === mine) { progress.textContent = text; progress.scrollTop = progress.scrollHeight; } },
    });
    if (ctrl !== mine) return;
    state.workout = workout;
    $('doneForm').hidden = true;
    renderToday();
  } catch (e) {
    if (ctrl === mine) showError('todayError', e, 'workout');
  } finally {
    if (ctrl === mine) {
      progress.hidden = true;
      btn.disabled = false; btn.textContent = label;
      ctrl = null;
    }
  }
}

function generate() {
  if (!state.sample) return;
  const request = $('request').value.trim();
  design((ctx) => buildGeneratePrompt({ style: state.style, request, ...ctx }), $('generateBtn'), t('generate'));
}

function revise() {
  const change = $('changeInput').value.trim();
  if (!change || !state.workout || !state.sample) return;
  const workout = state.workout;
  design((ctx) => buildRevisePrompt({ workout, change, ...ctx }), $('reviseBtn'), t('revise'))
    .then(() => { if (state.workout !== workout) $('changeInput').value = ''; });
}

async function saveDone() {
  const result = $('resultInput').value.trim();
  const w = state.workout;
  if (!w || !state.db || !state.sample) return;
  const btn = $('saveDoneBtn');
  btn.disabled = true; hide('todayError');
  const today = historyContext().today;
  try {
    const text = `Planned workout completed on ${today}:\n${JSON.stringify(w)}\n\nAthlete's result: ${result || '(completed as written)'}`;
    const session = await askJson(state.sample,
      buildParsePrompt({ text, today, unit: state.profile.unit, knownMovements: knownMovements() }),
      validateSession, { modelTier: 'quick' });
    await store.saveSession(state.db, state.uid, { ...session, source: 'generated', style: w.style, title: w.title, rawText: result });
    state.workout = null;
    $('resultInput').value = '';
    $('doneForm').hidden = true;
    renderToday();
    await reloadSessions().catch(() => {});
    show('todayNote', t('saved'));
  } catch (e) {
    if (e?.code || e?.message === 'invalid_output') showError('todayError', e, 'log');
    else show('todayError', t('saveFailed'));
    btn.textContent = t('retry');
  } finally {
    btn.disabled = false;
  }
}

export function wireToday() {
  for (const chip of document.querySelectorAll('#styleChips .chip')) {
    chip.addEventListener('click', () => {
      state.style = chip.dataset.style;
      for (const c of document.querySelectorAll('#styleChips .chip')) c.setAttribute('aria-pressed', String(c === chip));
    });
  }
  $('generateBtn').addEventListener('click', generate);
  $('reviseBtn').addEventListener('click', revise);
  $('changeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') revise(); });
  $('doneBtn').addEventListener('click', () => { $('doneForm').hidden = false; $('resultInput').focus(); });
  $('cancelDoneBtn').addEventListener('click', () => { $('doneForm').hidden = true; });
  $('saveDoneBtn').addEventListener('click', saveDone);
}
