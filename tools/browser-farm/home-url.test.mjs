// Home page della stanza: solo indirizzi web, altrimenti la predefinita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHomeUrl, DEFAULT_HOME_URL } from './home-url.mjs';

test('usa la home della stanza se è un indirizzo web', () => {
  assert.equal(resolveHomeUrl('https://sito.com/'), 'https://sito.com/');
  assert.equal(resolveHomeUrl('http://sito.com/x'), 'http://sito.com/x');
});

test('senza home o con schemi non web ricade sulla predefinita', () => {
  for (const v of [null, undefined, '', 'sito', 'javascript:alert(1)', 'file:///etc/passwd']) {
    assert.equal(resolveHomeUrl(v), DEFAULT_HOME_URL);
  }
});
