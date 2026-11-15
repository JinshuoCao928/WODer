// The one workout form, used by Log (add / edit a pending card) and History (edit a saved workout).
import { MOVEMENTS } from './library.js';
import { BENCHMARKS } from './benchmarks.js';
import { FORM_FORMATS, layoutOf, blockFieldsFor, moveFieldsFor, blockFromForm, formFromBlock, benchmarkBlock, isScaledFromRx, weightOptions } from './forms.js';
import { validateSession, PR_KINDS } from './core.js';
import { h, state, todayISO } from './app.js';
import { t } from './i18n.js';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PR_LABEL = { heaviest: 'prHeaviest', fastest: 'prFastest', mostReps: 'prMostReps', farthest: 'prFarthest' };

function ensureDatalists() {
  if (document.getElementById('movementList')) return;
  document.body.append(
    h('datalist', { id: 'movementList' }, MOVEMENTS.map((m) => h('option', { value: m.name, label: m.group }))),
    h('datalist', { id: 'repsList' }, range(1, 100).map((n) => h('option', { value: n }))),
  );
}

const blankMove = () => ({ name: '', sets: '', reps: '', load: '', unit: '', distance: '', timeMin: '', timeSec: '', note: '' });
const blankForm = () => ({ date: todayISO(), noDate: false, format: 'Strength', benchmark: '', scaled: false, minutes: '', every: '',
  rounds: '', scoreRounds: '', scoreReps: '', scoreMin: '', scoreSec: '', prKind: '', note: '', movements: [blankMove()] });

let seq = 0; // keeps ids unique when two forms are open (Log + History)

export function openForm(container, { block = null, date = null, submitLabel, onSubmit, onCancel = null }) {
  ensureDatalists();
  const unit = state.profile.unit;
  const p = `lf${++seq}-`;
  let v = block ? formFromBlock(block, date, unit) : blankForm();
  let error = '';

  const field = (id, labelKey, control, cls = 'field', label = t(labelKey)) => h('div', { class: cls }, h('label', { for: p + id }, label), control);
  const sel = (id, options, value, onChange) => {
    const el = h('select', { id: p + id }, options.map(([val, label]) =>
      h('option', { value: val, selected: String(val) === String(value) }, label)));
    el.addEventListener('change', () => onChange(el.value));
    return el;
  };
  // Typable number box with suggestions (datalist); any value can be typed.
  const numIn = (id, value, onInput, suggestions = [], attrs = {}) => {
    const el = h('input', { id: p + id, type: 'number', inputmode: 'decimal', step: 'any', min: 0, value,
      list: suggestions.length ? p + id + '-list' : null, ...attrs });
    el.addEventListener('input', () => onInput(el.value));
    return suggestions.length ? h('span', { class: 'lf-num' }, el, h('datalist', { id: p + id + '-list' }, suggestions.map((n) => h('option', { value: n })))) : el;
  };
  const input = (id, value, onInput, attrs = {}) => {
    const el = h('input', { id: p + id, value, ...attrs });
    el.addEventListener('input', () => onInput(el.value));
    return el;
  };
  const timePair = (id, min, sec, onChange) => h('div', { class: 'lf-time' },
    numIn(id + '-m', min, (x) => onChange(x, null), [], { step: 1, placeholder: t('minShort') }),
    h('span', { 'aria-hidden': 'true' }, ':'),
    numIn(id + '-s', sec, (x) => onChange(null, x), [], { step: 1, max: 59, placeholder: t('secShort'), 'aria-label': t('secShort') }));

  const scaledBox = () => container.querySelector(`#${p}scaled`);
  // After a movement or load change on a benchmark, recompute Scaled (a manual tick holds until the next change).
  const rescale = () => {
    if (!v.benchmark) return;
    v.scaled = isScaledFromRx(blockFromForm(v, unit).block, v.benchmark, unit);
    if (scaledBox()) scaledBox().checked = v.scaled;
  };

  function render() {
    const layout = layoutOf(v.format);
    const prKind = layout === 'pr' ? v.prKind || 'heaviest' : null;
    const bf = blockFieldsFor(layout, prKind);
    const mf = moveFieldsFor(layout, prKind);
    const rx = v.benchmark ? benchmarkBlock(v.benchmark, unit) : null;
    const loads = weightOptions(unit, [...(rx?.movements ?? []).map((m) => m.load), ...v.movements.map((m) => (m.load === '' ? NaN : Number(m.load)))]);

    const dateInput = h('input', { id: p + 'date', type: 'date', value: v.date, disabled: v.noDate });
    dateInput.addEventListener('input', () => { v.date = dateInput.value; });
    const noDate = h('input', { id: p + 'nodate', type: 'checkbox', checked: v.noDate });
    noDate.addEventListener('change', () => { v.noDate = noDate.checked; dateInput.disabled = noDate.checked; });
    const scaled = h('input', { id: p + 'scaled', type: 'checkbox', checked: v.scaled });
    scaled.addEventListener('change', () => { v.scaled = scaled.checked; });

    const setup = [];
    if (bf.includes('rounds')) setup.push(field('rounds', 'rounds', numIn('rounds', v.rounds, (x) => { v.rounds = x; }, range(1, 10), { step: 1 })));
    if (bf.includes('every')) setup.push(field('every', 'every', numIn('every', v.every, (x) => { v.every = x; }, range(1, 5), { step: 1 })));
    if (bf.includes('minutes')) setup.push(field('minutes', layout === 'fortime' ? 'timeCap' : 'minutes',
      numIn('minutes', v.minutes, (x) => { v.minutes = x; }, [5, 10, 12, 15, 20, 30, 40, 60], { step: 1 })));
    if (bf.includes('prKind')) setup.push(field('prkind', 'prKind', sel('prkind', PR_KINDS.map((k) => [k, t(PR_LABEL[k])]), prKind, (x) => { v.prKind = x; render(); })));

    const results = [];
    if (bf.includes('scoreRounds')) results.push(field('srounds', 'scoreRounds', numIn('srounds', v.scoreRounds, (x) => { v.scoreRounds = x; }, [], { step: 1 })));
    if (bf.includes('scoreReps')) results.push(field('sreps', layout === 'amrap' ? 'extraReps' : 'totalReps',
      input('sreps', v.scoreReps, (x) => { v.scoreReps = x; }, { type: 'number', inputmode: 'numeric', min: 0 })));
    if (bf.includes('scoreTime')) results.push(field('stime-m', 'time', timePair('stime', v.scoreMin, v.scoreSec, (m, s) => {
      if (m != null) v.scoreMin = m; if (s != null) v.scoreSec = s;
    })));

    const moves = (layout === 'pr' ? v.movements.slice(0, 1) : v.movements).map((m, i) => {
      const id = `m${i}-`;
      if (prKind === 'heaviest' && !m.reps) m.reps = '1';
      const cells = [field(id + 'name', 'movement', input(id + 'name', m.name, (x) => { m.name = x; rescale(); },
        { list: 'movementList', placeholder: t('movementPh'), autocomplete: 'off' }), 'field wide')];
      if (mf.includes('sets')) cells.push(field(id + 'sets', 'sets', numIn(id + 'sets', m.sets, (x) => { m.sets = x; }, range(1, 10), { step: 1 })));
      if (mf.includes('reps')) cells.push(prKind === 'heaviest'
        ? field(id + 'reps', 'repMax', sel(id + 'reps', [1, 2, 3, 5].map((n) => [n, `${n}RM`]), m.reps || 1, (x) => { m.reps = x; }))
        : field(id + 'reps', 'reps', input(id + 'reps', m.reps, (x) => { m.reps = x; }, { list: 'repsList', autocomplete: 'off' })));
      if (mf.includes('load')) cells.push(field(id + 'load', 'weight', numIn(id + 'load', m.load, (x) => { m.load = x; m.unit = ''; rescale(); }, loads),
        'field', `${t('weight')} (${unit})`));
      if (mf.includes('distance')) cells.push(field(id + 'dist', prKind === 'farthest' ? 'amount' : 'distance',
        input(id + 'dist', m.distance, (x) => { m.distance = x; }, { placeholder: prKind === 'farthest' ? '42 cal' : state.profile.distance === 'imperial' ? '1/4 mile' : '400m' })));
      if (mf.includes('time')) cells.push(field(id + 'time-m', 'time', timePair(id + 'time', m.timeMin, m.timeSec, (mm, ss) => {
        if (mm != null) m.timeMin = mm; if (ss != null) m.timeSec = ss;
      })));
      const remove = layout !== 'pr' && v.movements.length > 1
        ? h('button', { type: 'button', class: 'secondary danger', onclick: () => { v.movements.splice(i, 1); rescale(); render(); } }, t('removeMovement'))
        : null;
      return h('div', { class: 'lf-move' }, h('div', { class: 'lf-row' }, cells), remove ? h('div', { class: 'row' }, remove) : null);
    });

    const note = h('textarea', { id: p + 'note' }, v.note);
    note.addEventListener('input', () => { v.note = note.value; });

    container.replaceChildren(h('form', { class: 'lf', novalidate: true, onsubmit: (e) => { e.preventDefault(); submit(); } },
      h('div', { class: 'lf-row' },
        field('date', 'date', dateInput),
        h('label', { class: 'lf-check' }, noDate, t('noDate'))),
      h('div', { class: 'lf-row' },
        field('bench', 'benchmark', sel('bench', [['', t('none')], ...BENCHMARKS.map((b) => [b.name, b.name])], v.benchmark, (x) => {
          if (!x) { v.benchmark = ''; render(); return; }
          v = { ...formFromBlock(benchmarkBlock(x, unit), null, unit), date: v.date, noDate: v.noDate };
          render();
        })),
        field('format', 'format', sel('format', FORM_FORMATS.map((f) => [f.name, f.name]), v.format, (x) => { v.format = x; render(); })),
        h('label', { class: 'lf-check' }, scaled, t('scaled'))),
      setup.length ? h('div', { class: 'lf-row' }, setup) : null,
      ...moves,
      layout !== 'pr' ? h('div', { class: 'row' }, h('button', { type: 'button', class: 'secondary',
        onclick: () => { v.movements.push(blankMove()); rescale(); render(); } }, t('addMovement'))) : null,
      results.length ? h('div', { class: 'lf-row' }, results) : null,
      field('note', 'note', note),
      error ? h('p', { class: 'msg error', role: 'alert' }, error) : null,
      h('div', { class: 'row' },
        h('button', { type: 'submit', class: 'primary' }, submitLabel),
        onCancel ? h('button', { type: 'button', class: 'secondary', onclick: onCancel }, t('cancel')) : null)));
  }

  function submit() {
    const layout = layoutOf(v.format);
    const { date, block } = blockFromForm(v, unit);
    if (layout !== 'other' && block.movements.length === 0) { error = t('needMovement'); render(); return; }
    const r = validateSession({ date, style: 'other', blocks: [block] }, unit);
    if (!r.ok) { error = r.error; render(); return; }
    onSubmit({ date, block: r.value.blocks[0] });
  }

  render();
}
