import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, setLang, getLang } from '../src/i18n.js';

test('switching language changes every string at once', () => {
  setLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(t('tabToday'), '今天');
  setLang('en');
  assert.equal(t('tabToday'), 'Today');
  setLang('fr'); // unknown -> English
  assert.equal(getLang(), 'en');
});
