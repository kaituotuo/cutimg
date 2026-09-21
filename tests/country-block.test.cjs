'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function run() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'functions', '_middleware.js'), 'utf8');
  const middleware = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

  const next = () => new Response('next');
  const blocked = await middleware.onRequest({ request: { cf: { country: 'cn' } }, next });
  assert.equal(blocked.status, 503);
  assert.match(await blocked.text(), /temporarily offline/i);
  assert.equal(blocked.headers.get('Cache-Control'), 'no-store, private');
  assert.equal(blocked.headers.get('X-Robots-Tag'), 'noindex, nofollow');

  const allowed = await middleware.onRequest({ request: { cf: { country: 'US' } }, next });
  assert.equal(allowed.status, 503);

  const unknown = await middleware.onRequest({ request: {}, next });
  assert.equal(unknown.status, 503);
  console.log('country block tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
