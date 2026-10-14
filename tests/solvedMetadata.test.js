const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function load(fetch) {
  const logs = [];
  const context = vm.createContext({ fetch, AbortSignal, console: { warn: (...args) => logs.push(args) },
    setTimeout: fn => { fn(); return 0; }, chrome: { runtime: { onMessage: { addListener() {} } } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/background.js'), 'utf8'), context);
  return { context, logs };
}
test('solved.ac 403 challenge reason and status are returned to the content console', async () => {
  let calls = 0;
  const { context, logs } = load(async () => { calls++; return new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }); });
  const result = await context.SolvedApiCall(1197, true);
  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'cloudflare_challenge');
  assert.equal(result.error.status, 403);
  assert.equal(calls, 1);
  assert.ok(logs.length);
});
test('rate limit and network/JSON failures have explicit diagnostics', async () => {
  const rate = load(async () => new Response('{}', { status: 429 }));
  const result = await rate.context.SolvedApiCall(1197, true);
  assert.equal(result.error.status, 429);
  assert.equal(result.error.attempt, 4);
  const network = load(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal((await network.context.SolvedApiCall(1197, true)).error.reason, 'network_error');
  const invalid = load(async () => new Response('not json'));
  assert.equal((await invalid.context.SolvedApiCall(1197, true)).error.reason, 'invalid_json');
});
test('valid tiers including actual Unrated are returned, invalid metadata is rejected', async () => {
  const data = { problemId: 1197, level: 12 };
  const good = load(async () => new Response(JSON.stringify(data)));
  assert.equal((await good.context.SolvedApiCall(1197, true)).data.level, 12);
  assert.equal((await good.context.SolvedApiCall(1197)).level, 12);
  const unrated = load(async () => new Response(JSON.stringify({ problemId: 1197, level: 0 })));
  assert.equal((await unrated.context.SolvedApiCall(1197, true)).ok, true);
  const invalid = load(async () => new Response(JSON.stringify({ level: 99 })));
  assert.equal((await invalid.context.SolvedApiCall(1197, true)).error.reason, 'invalid_response');
});
