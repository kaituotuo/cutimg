'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../i18n.js');

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.entries.has(key) ? this.entries.get(key) : null;
  }

  setItem(key, value) {
    this.entries.set(key, String(value));
  }
}

async function run() {
  assert.deepEqual(
    Object.keys(i18n.messages.zh).sort(),
    Object.keys(i18n.messages.en).sort(),
    'Chinese and English dictionaries must expose the same message keys'
  );

  assert.equal(i18n.languageForCountry('CN'), 'zh');
  assert.equal(i18n.languageForCountry('cn'), 'zh');
  for (const country of ['US', 'GB', 'HK', 'TW', 'SG', 'JP', '', null]) {
    assert.equal(i18n.languageForCountry(country), 'en', `${country} should default to English`);
  }

  assert.equal(i18n.languageForBrowser(['en-US', 'zh-CN']), 'zh');
  assert.equal(i18n.languageForBrowser(['en-US', 'fr-FR']), 'en');
  assert.equal(i18n.t('en', 'targetHeightRange', { max: 1442 }), 'Target height must be between 2 and 1442 px.');
  assert.equal(i18n.t('zh', 'targetHeightRange', { max: 1442 }), '目标高度需在 2–1442 px 之间。');
  assert.equal(i18n.formatCount('en', 'guide', 1), '1 cut line');
  assert.equal(i18n.formatCount('en', 'guide', 2), '2 cut lines');
  assert.equal(i18n.formatCount('en', 'slice', 1), '1 slice');
  assert.equal(i18n.formatCount('en', 'slice', 2), '2 slices');

  const now = 1_800_000_000_000;
  const cached = new MemoryStorage();
  i18n.writeAutoLanguage(cached, 'zh', now);
  assert.equal(i18n.readAutoLanguage(cached, now + 24 * 60 * 60 * 1000 - 1), 'zh');
  assert.equal(i18n.readAutoLanguage(cached, now + 24 * 60 * 60 * 1000), null);

  const manualWins = new MemoryStorage();
  i18n.writeAutoLanguage(manualWins, 'zh', now);
  i18n.writeManualLanguage(manualWins, 'en');
  assert.equal(i18n.initialLanguage(manualWins, ['zh-CN'], now), 'en');

  let resolveCountry;
  const delayedFetch = () => new Promise((resolve) => { resolveCountry = resolve; });
  const delayedDetection = i18n.detectCountryLanguage(delayedFetch, 5000);
  await Promise.resolve();
  i18n.writeManualLanguage(manualWins, 'en');
  resolveCountry({
    ok: true,
    json: async () => ({ country: 'CN' })
  });
  assert.equal(await delayedDetection, 'zh');
  assert.equal(i18n.readManualLanguage(manualWins), 'en', 'late geolocation must not overwrite a manual choice');
  assert.equal(i18n.initialLanguage(manualWins, ['zh-CN'], now + 1), 'en');

  assert.equal(await i18n.detectCountryLanguage(null, 10, 'CN'), 'zh');
  assert.equal(await i18n.detectCountryLanguage(null, 10, 'US'), 'en');

  const timeoutFallback = await i18n.resolveLanguage({
    storage: new MemoryStorage(),
    browserLanguages: ['en-US'],
    fetchImpl: () => new Promise(() => {}),
    timeoutMs: 10,
    now
  });
  assert.deepEqual(timeoutFallback, { language: 'en', source: 'browser' });

  let delayedResolve;
  const raceStorage = new MemoryStorage();
  const race = i18n.resolveLanguage({
    storage: raceStorage,
    browserLanguages: ['en-US'],
    fetchImpl: () => new Promise((resolve) => { delayedResolve = resolve; }),
    timeoutMs: 1000,
    now
  });
  await Promise.resolve();
  i18n.writeManualLanguage(raceStorage, 'en');
  delayedResolve({ ok: true, json: async () => ({ country: 'CN' }) });
  assert.deepEqual(await race, { language: 'en', source: 'manual' });

  const functionSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'api', 'country.js'), 'utf8');
  const countryFunction = await import(`data:text/javascript;base64,${Buffer.from(functionSource).toString('base64')}`);
  const cnResponse = countryFunction.onRequestGet({ request: { cf: { country: 'cn' } } });
  assert.deepEqual(await cnResponse.json(), { country: 'CN' });
  assert.equal(cnResponse.headers.get('Cache-Control'), 'no-store');
  const unknownResponse = countryFunction.onRequestGet({ request: {} });
  assert.deepEqual(await unknownResponse.json(), { country: null });

  console.log('i18n tests passed');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = run;
