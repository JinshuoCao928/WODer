// Today tab: design a workout from history + today's request, revise it, mark it done.
import { buildGeneratePrompt, buildRevisePrompt, validateWorkout } from './core.js';
import { askJson } from './claude.js';
import * as store from './store.js';
import { t } from './i18n.js';
import { state, show, hide, renderToday, reloadSessions, historyContext, isReadOnlyError, markReadOnly } from './app.js';
import { showError, parseSessions } from './log.js';
import { mergeParsed } from './forms.js';
import { workoutForLog } from './core.js';

const $ = (id) => document.getElementById(id);
let ctrl = null;
let pendingDone = null; // parsed result kept across Retry so a failed write doesn't re-run Claude

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
    btn.disabled = false; btn.textContent = label;
    if (ctrl === mine) { progress.hidden = true; ctrl = null; }
  }
}

const pressed = (id) => [...document.querySelectorAll(`#${id} .chip[aria-pressed="true"]`)].map((c) => c.dataset.value);

function generate() {
  if (!state.sample) return;
  const prefs = { feel: $('feel').value, focus: pressed('focusChips'), time: $('timeAvail').value, equipment: pressed('equipChips'),
    intensity: $('intensity').value, avoid: $('avoid').value, extra: $('extra').value };
  design((ctx) => buildGeneratePrompt({ prefs, ...ctx }), $('generateBtn'), t('generate'));
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
    if (pendingDone?.w !== w || pendingDone.result !== result) {
      const text = `Planned workout completed on ${today}:\n${JSON.stringify(workoutForLog(w))}\n\nAthlete's result: ${result || '(completed as written)'}`;
      pendingDone = { w, result, session: mergeParsed(await parseSessions(text)) };
    }
  } catch (e) {
    showError('todayError', e, 'log');
    btn.disabled = false;
    return;
  }
  try {
    await store.saveSession(state.db, state.uid, { ...pendingDone.session, date: today, source: 'generated', style: w.style, title: w.title, rawText: result });
    pendingDone = null;
    if (state.workout === w) state.workout = null; // a newer workout designed meanwhile stays
    $('resultInput').value = '';
    $('doneForm').hidden = true;
    renderToday();
    await reloadSessions().catch(() => {});
    show('todayNote', t('saved'));
  } catch (e) {
    if (isReadOnlyError(e)) { pendingDone = null; markReadOnly(); return; }
    show('todayError', t('saveFailed'));
    btn.textContent = t('retry');
  } finally {
    btn.disabled = false;
  }
}

export function wireToday() {
  for (const chip of document.querySelectorAll('#focusChips .chip, #equipChips .chip'))
    chip.addEventListener('click', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')));
  $('generateBtn').addEventListener('click', generate);
  $('reviseBtn').addEventListener('click', revise);
  $('changeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && !ctrl) revise(); });
  $('doneBtn').addEventListener('click', () => { $('doneForm').hidden = false; $('resultInput').focus(); });
  $('cancelDoneBtn').addEventListener('click', () => { $('doneForm').hidden = true; });
  $('saveDoneBtn').addEventListener('click', saveDone);
}
