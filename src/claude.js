import { extractJson, STRICT_SUFFIX } from './core.js';

// Ask Claude for JSON, validate it, and retry once with a stricter instruction.
// Platform rejections (rate_limited, not_granted, cancelled, ...) propagate unchanged.
export async function askJson(sample, prompt, validate, { modelTier, signal, onText } = {}) {
  for (const p of [prompt, prompt + '\n\n' + STRICT_SUFFIX]) {
    const res = await sample(p, { modelTier, signal, onText, cache: false });
    let parsed;
    try { parsed = extractJson(res.text); } catch { continue; }
    const r = validate(parsed);
    if (r.ok) return r.value;
  }
  throw new Error('invalid_output');
}

// Map any failure from askJson or the store to a message key (null = say nothing).
export function errorKey(e, kind) {
  const code = e?.code;
  if (code === 'cancelled' || e?.name === 'AbortError') return null;
  if (code === 'rate_limited' || code === 'queue_overflow') return 'busy';
  if (code === 'not_granted' || code === 'sampling_disabled') return 'noAi';
  if (e?.message === 'invalid_output' || code === 'empty_completion' || code === 'invalid_json' || code === 'refused')
    return kind === 'log' ? 'rephraseLog' : 'rephraseWorkout';
  return 'failed';
}
