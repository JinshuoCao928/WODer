import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askJson, errorKey } from '../src/claude.js';
import { STRICT_SUFFIX } from '../src/core.js';

const fakeSample = (replies) => {
  const calls = [];
  const fn = async (prompt, opts) => {
    calls.push({ prompt, opts });
    const r = replies[calls.length - 1];
    if (r instanceof Error || (r && r.code)) throw r;
    return { text: r, truncated: false };
  };
  return { fn, calls };
};
const validate = (o) => (o && o.ok === 1 ? { ok: true, value: o } : { ok: false, error: 'bad' });

test('returns validated value on first try', async () => {
  const s = fakeSample(['{"ok":1}']);
  assert.deepEqual(await askJson(s.fn, 'P', validate, { modelTier: 'quick' }), { ok: 1 });
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].opts.modelTier, 'quick');
  assert.equal(s.calls[0].opts.cache, false);
});

test('retries once with the strict suffix', async () => {
  const s = fakeSample(['sure! here is nothing', '```json\n{"ok":1}\n```']);
  assert.deepEqual(await askJson(s.fn, 'P', validate), { ok: 1 });
  assert.equal(s.calls.length, 2);
  assert.ok(s.calls[1].prompt.endsWith(STRICT_SUFFIX));
});

test('gives up after two invalid answers', async () => {
  const s = fakeSample(['{"ok":0}', '{"ok":0}', '{"ok":1}']);
  await assert.rejects(askJson(s.fn, 'P', validate), /invalid_output/);
  assert.equal(s.calls.length, 2);
});

test('platform errors propagate without retry', async () => {
  const s = fakeSample([{ code: 'rate_limited', message: 'slow down' }]);
  await assert.rejects(askJson(s.fn, 'P', validate), (e) => e.code === 'rate_limited');
  assert.equal(s.calls.length, 1);
});

test('errorKey maps failures to messages', () => {
  assert.equal(errorKey({ code: 'cancelled' }), null);
  assert.equal(errorKey({ name: 'AbortError' }), null);
  assert.equal(errorKey({ code: 'rate_limited' }), 'busy');
  assert.equal(errorKey({ code: 'not_granted' }), 'noAi');
  assert.equal(errorKey(new Error('invalid_output'), 'log'), 'rephraseLog');
  assert.equal(errorKey({ code: 'empty_completion' }, 'workout'), 'rephraseWorkout');
  assert.equal(errorKey(new Error('timeout')), 'failed');
});
