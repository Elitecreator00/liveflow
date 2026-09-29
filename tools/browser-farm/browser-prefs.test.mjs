import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptLanguages, writeLanguagePrefs } from './browser-prefs.mjs';

test('lingua inglese: niente "en" duplicato', () => {
  assert.equal(acceptLanguages({ acceptLanguage: 'en-GB,en,en' }), 'en-GB,en');
});

test('lingua non inglese: la coda "en" resta', () => {
  assert.equal(acceptLanguages({ acceptLanguage: 'it-IT,it,en' }), 'it-IT,it,en');
});

test('q-values rimossi, fallback sul locale', () => {
  assert.equal(acceptLanguages({ acceptLanguage: 'de-DE;q=1,de;q=0.9' }), 'de-DE,de');
  assert.equal(acceptLanguages({ locale: 'fr-FR' }), 'fr-FR');
  assert.equal(acceptLanguages(null), 'it-IT');
});

test('scrive la lingua nel profilo preservando le altre preferenze', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lf-prefs-'));
  try {
    mkdirSync(join(dir, 'Default'));
    writeFileSync(
      join(dir, 'Default', 'Preferences'),
      JSON.stringify({ profile: { name: 'x' }, intl: { accept_languages: 'en-US,en', other: 1 } }),
    );
    writeLanguagePrefs(dir, { acceptLanguage: 'en-GB,en,en' });
    const prefs = JSON.parse(readFileSync(join(dir, 'Default', 'Preferences'), 'utf8'));
    assert.equal(prefs.intl.accept_languages, 'en-GB,en');
    assert.equal(prefs.intl.selected_languages, 'en-GB,en');
    assert.equal(prefs.intl.other, 1);
    assert.equal(prefs.profile.name, 'x');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('profilo nuovo o preferenze corrotte: file creato da zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lf-prefs-'));
  try {
    writeLanguagePrefs(dir, { acceptLanguage: 'pl-PL,pl,en' });
    let prefs = JSON.parse(readFileSync(join(dir, 'Default', 'Preferences'), 'utf8'));
    assert.equal(prefs.intl.accept_languages, 'pl-PL,pl,en');
    writeFileSync(join(dir, 'Default', 'Preferences'), '{rotto');
    writeLanguagePrefs(dir, { acceptLanguage: 'it-IT,it,en' });
    prefs = JSON.parse(readFileSync(join(dir, 'Default', 'Preferences'), 'utf8'));
    assert.equal(prefs.intl.accept_languages, 'it-IT,it,en');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
