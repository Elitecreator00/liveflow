import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCopyShortcut } from './clipboard.mjs';

const key = (key, modifiers, kind = 'down') => ({ type: 'key', kind, key, modifiers });

test('Ctrl+C e Ctrl+X sono copia, anche con Maiusc o maiuscola', () => {
  assert.equal(isCopyShortcut(key('c', 2)), true);
  assert.equal(isCopyShortcut(key('x', 2)), true);
  assert.equal(isCopyShortcut(key('C', 2 | 8)), true);
});

test('non sono copia: lettera senza Ctrl, rilascio del tasto, Ctrl+V', () => {
  assert.equal(isCopyShortcut(key('c', 0)), false);
  assert.equal(isCopyShortcut(key('c', 2, 'up')), false);
  assert.equal(isCopyShortcut(key('v', 2)), false);
  assert.equal(isCopyShortcut({ type: 'text', text: 'c' }), false);
});
