const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const protocol = require('../scripts/testcase/protocol');
const archive = require('../scripts/archive/links');
const good = { status: 'not_found', totalCases: 100, correctCasesCount: 100, wrongCasesCount: 0, executionFailedCasesCount: 0, requestId: 'req-1' };
const submission = { problemId: '1000', title: 'A+B', language: 'cpp23', code: 'int main(){}\n' };
const source = name => fs.readFileSync(path.join(__dirname, '..', 'scripts', 'testcase', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('only positive, completed, all-passed test results qualify', () => {
  assert.equal(protocol.accepted(good), true);
  for (const change of [
    { status: 'found' }, { status: 'compile_error' }, { status: 'runtime_error' }, { status: 'internal_error' },
    { totalCases: 0, correctCasesCount: 0 }, { totalCases: -1 }, { totalCases: 1.5 },
    { correctCasesCount: 99 }, { correctCasesCount: undefined }, { wrongCasesCount: 1 },
    { wrongCasesCount: undefined }, { executionFailedCasesCount: 1 }, { errorMessage: 'error' },
    { wrongCases: [{}] }, { counterexample: {} }, { executionFailedCases: [{}] },
  ]) assert.equal(protocol.accepted({ ...good, ...change }), false, JSON.stringify(change));
  assert.equal(protocol.accepted({ type: 'progress', progress: { completedIterations: 100 } }), false);
});

test('split UTF-8 NDJSON, final newline optional, missing/error/invalid streams fail closed', async () => {
  const result = { ...good, requestId: '한글' };
  const bytes = new TextEncoder().encode(JSON.stringify({ type: 'progress', progress: { completedIterations: 100 } }) + '\n' + JSON.stringify({ type: 'result', result }));
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } }));
  assert.deepEqual(await protocol.readResult(response), result);
  for (const text of ['', '{broken', '{"type":"progress"}\n', JSON.stringify({ type: 'result', result }) + '\n{"type":"progress"}']) {
    await assert.rejects(protocol.readResult(new Response(text)));
  }
  await assert.rejects(protocol.readResult(new Response('error', { status: 500 })));
  let calls = 0;
  await assert.rejects(protocol.readResult({ ok: true, body: { getReader: () => ({
    read: async () => { if (calls++) throw new Error('disconnected'); return { value: bytes, done: false }; },
    cancel: async () => {}, releaseLock: () => {},
  }) } }));
});

test('MAIN bridge observes submitted code without consuming the site response', async () => {
  const events = [];
  let resolveFetch;
  const location = { origin: 'https://testcase.ac', href: 'https://testcase.ac/problems/boj/1000', pathname: '/problems/boj/1000' };
  const context = vm.createContext({ BJHTestcase: protocol, URL, Request, location,
    document: { querySelector: () => ({ textContent: 'A+B' }) },
    window: { fetch: () => new Promise(resolve => { resolveFetch = resolve; }), postMessage: data => events.push(data) },
  });
  vm.runInContext(source('bridge.js'), context);
  const payload = { targetCode: submission.code, targetCodeLang: submission.language };
  const promise = context.window.fetch('https://api.testcase.ac/api/problems/boj/1000/stress', { method: 'POST', body: JSON.stringify(payload) });
  payload.targetCode = 'edited while running';
  location.pathname = '/problems/boj/1001';
  const text = JSON.stringify({ type: 'result', result: good });
  resolveFetch(new Response(text));
  const response = await promise;
  assert.equal(await response.text(), text);
  for (let i = 0; i < 10 && events.length < 2; i++) await tick();
  assert.equal(events[0].kind, 'submitted');
  assert.equal(events[1].kind, 'completed');
  assert.equal(events[1].submission.code, submission.code);
  assert.equal(events[1].submission.problemId, '1000');
});

test('bridge ignores custom invocation and unrelated hosts and cleans up network failures', async () => {
  const events = [];
  const context = vm.createContext({ BJHTestcase: protocol, URL, Request,
    location: { origin: 'https://testcase.ac', href: 'https://testcase.ac/problems/boj/1000', pathname: '/problems/boj/1000' },
    document: { querySelector: () => null },
    window: { fetch: async () => { throw new Error('network'); }, postMessage: data => events.push(data) },
  });
  vm.runInContext(source('bridge.js'), context);
  const init = { method: 'POST', body: JSON.stringify({ targetCode: submission.code, targetCodeLang: 'cpp23' }) };
  for (const url of ['https://other.example/api/problems/boj/1000/stress', 'https://api.testcase.ac/api/custom-invocation/stress']) await assert.rejects(context.window.fetch(url, init));
  assert.equal(events.length, 0);
  await assert.rejects(context.window.fetch('https://api.testcase.ac/api/problems/boj/1000/stress', init));
  await tick();
  assert.deepEqual(events.map(e => e.kind), ['submitted', 'failed']);
});

function uploadContext() {
  const state = { commits: [], records: [], remote: null, enabled: true, token: 'token', fail: false, templates: [], tree: [], truncated: false };
  const context = vm.createContext({ BJHTestcase: protocol, BJHArchive: archive,
    checkEnable: async () => state.enabled, getHook: async () => 'user/repo', getToken: async () => state.token,
    getFile: async (_, __, filePath) => filePath.endsWith('/README.md') ? state.attribution : state.remote, calculateBlobSHA: code => 'sha:' + code,
    atob,
    setTimeout: () => 0, clearTimeout() {},
    convertSingleCharToDoubleChar: text => text, getDateString: () => 'date',
    buildDirectory: async (platform, vars) => { state.templates.push({ platform, vars }); return vars._defaultDir; },
    recordUploadInStats: async (...args) => state.records.push(args),
    GitHub: class {
      async getDefaultBranchOnRepo() { return 'main'; }
      async getTreeWithTruncation() { return { tree: state.tree, truncated: state.truncated }; }
      async createBlob(code, path) { return { code, path, sha: 'sha:' + code }; }
      async commitTreeItems(branch, planner, message) {
        if (state.fail) throw new Error('expired token');
        const items = typeof planner === 'function' ? await planner('parent') : planner;
        if (!items.length) return { unchanged: true, treeItems: [] };
        state.commits.push({ branch, items, message });
        return { treeItems: items };
      }
    },
  });
  vm.runInContext(source('upload.js'), context);
  return { state, context };
}

test('upload uses submitted source, BOJ templates, and one commit for code + attributed README', async () => {
  const { state, context } = uploadContext();
  await context.uploadTestcase(submission, good);
  assert.equal(state.commits.length, 1);
  const commit = state.commits[0];
  assert.equal(commit.items[0].code, submission.code);
  assert.match(commit.items[0].path, /1000.*A\+B\.cc$/);
  assert.match(commit.items[1].code, /100\/100/);
  assert.match(commit.items[1].code, /BOJ 공식 채점 결과가 아니며/);
  assert.match(commit.items[1].code, /web.archive.org/);
  assert.equal(state.templates[0].platform, 'testcase');
  assert.equal(state.records.length, 1);
  state.remote = { sha: 'sha:' + submission.code };
  state.tree = [{ type: 'blob', path: state.commits[0].items[0].path, sha: state.remote.sha }];
  await context.uploadTestcase(submission, good);
  assert.equal(state.commits.length, 1);
});

test('solved.ac tier preserves BOJ directory conventions with Unrated fallback', async () => {
  const { state, context } = uploadContext();
  await context.makeTestcaseData(submission, good, { level: 1 });
  assert.equal(state.templates[0].vars.level, 'Bronze');
  assert.equal(state.templates[0].vars.levelFull, 'Bronze V');
  assert.equal(context.testcaseTier(31), 'Master');
  assert.equal(context.testcaseTier(null), 'Unrated');
  assert.equal(context.testcaseTier(32), 'Unrated');
});

function migrationContext() {
  const loaded = uploadContext();
  loaded.context.chrome = { runtime: { sendMessage: async () => ({ ok: true, data: { level: 12 } }) } };
  return loaded;
}
const treeFile = (path, sha) => ({ path, sha, mode: '100644', type: 'blob' });

test('tier success migrates all Unrated solution files atomically even for an already uploaded source', async () => {
  const { state, context } = migrationContext();
  const old = (await context.makeTestcaseData(submission, good)).directory;
  const target = (await context.makeTestcaseData(submission, good, { level: 12 })).directory;
  assert.match(target, /^백준\/testcase\.ac\/Gold\//);
  state.remote = { sha: 'sha:' + submission.code };
  state.tree = [treeFile(`${target}/A+B.cc`, state.remote.sha),
    treeFile(`${old}/A+B.cc`, 'old-code'), treeFile(`${old}/README.md`, 'old-readme'),
    treeFile(`${old}/other.java`, 'java-blob'), treeFile(`${old}/samples/input1.txt`, 'sample-blob')];
  const result = await context.uploadTestcase(submission, good);
  assert.match(result, /경로로 이동/);
  assert.equal(state.commits.length, 1);
  const items = state.commits[0].items;
  assert.equal(items.filter(item => item.sha === null).length, 4);
  assert.equal(items.find(item => item.path === `${target}/other.java`).sha, 'java-blob');
  assert.equal(items.find(item => item.path === `${target}/samples/input1.txt`).sha, 'sample-blob');
  assert.equal(state.records.length, 1);
});

test('legacy testcase folders move only with attribution read at the pinned commit', async () => {
  const { state, context } = migrationContext();
  const legacy = '백준/Unrated/1000. A+B';
  state.tree = [treeFile(`${legacy}/A+B.cc`, 'old-code'), treeFile(`${legacy}/README.md`, 'old-readme')];
  state.attribution = { encoding: 'base64', content: btoa('https://testcase.ac/problems/boj/1000') };
  let ref;
  context.getFile = async (_, __, filePath, pinned) => { if (filePath.endsWith('/README.md')) { ref = pinned; return state.attribution; } return null; };
  await context.uploadTestcase(submission, good);
  assert.equal(ref, 'parent');
  assert.equal(state.commits[0].items.filter(item => item.sha === null).length, 2);
  const official = migrationContext();
  official.state.tree = state.tree;
  official.state.attribution = { encoding: 'base64', content: btoa('BOJ official accepted submission') };
  await official.context.uploadTestcase(submission, good);
  assert.equal(official.state.commits[0].items.some(item => item.sha === null), false);
});

test('migration conflicts preserve originals and incomplete trees prevent any commit', async () => {
  const { state, context } = migrationContext();
  const old = (await context.makeTestcaseData(submission, good)).directory;
  const target = (await context.makeTestcaseData(submission, good, { level: 12 })).directory;
  state.tree = [treeFile(`${old}/other.java`, 'old'), treeFile(`${target}/other.java`, 'different')];
  assert.match(await context.uploadTestcase(submission, good), /원본 유지/);
  assert.equal(state.commits[0].items.some(item => item.sha === null), false);
  state.truncated = true;
  await assert.rejects(context.uploadTestcase(submission, good), /불완전/);
  assert.equal(state.commits.length, 1);
});

test('content console reports detailed tier failure and identifies a real Unrated success', async () => {
  const { context } = uploadContext();
  const warnings = [], successes = [];
  context.console = { warn: (...args) => warnings.push(args), info: (...args) => successes.push(args) };
  context.chrome = { runtime: { sendMessage: async () => ({ ok: false, error: { reason: 'cloudflare_challenge', status: 403 } }) } };
  assert.equal(await context.testcaseMetadata('1197'), null);
  assert.equal(warnings[0][1].status, 403);
  assert.equal(warnings[0][1].reason, 'cloudflare_challenge');
  context.chrome.runtime.sendMessage = async () => ({ ok: true, data: { level: 0 } });
  assert.equal((await context.testcaseMetadata('1197')).level, 0);
  assert.equal(successes[0][1].tier, 'Unrated');
});

test('disabled, invalid, unauthenticated submissions never commit; errors propagate and retry works', async () => {
  const { state, context } = uploadContext();
  state.enabled = false;
  await assert.rejects(context.uploadTestcase(submission, good));
  state.enabled = true;
  await assert.rejects(context.uploadTestcase(submission, { ...good, correctCasesCount: 99 }));
  await assert.rejects(context.uploadTestcase({ ...submission, language: 'unknown' }, good));
  state.token = null;
  await assert.rejects(context.uploadTestcase(submission, good));
  assert.equal(state.commits.length, 0);
  state.token = 'token'; state.fail = true;
  await assert.rejects(context.uploadTestcase(submission, good), /expired token/);
  assert.equal(state.records.length, 0);
  state.fail = false;
  await context.uploadTestcase(submission, good);
  assert.equal(state.commits.length, 1);
});

test('content observer ignores history and foreign messages, respects OFF, and retries a failed upload', async () => {
  let listener, enabled = true, fail = true;
  const uploaded = [], elements = new Map();
  const timers = new Map();
  let timerId = 0;
  function element() {
    return { style: {}, children: [], setAttribute() {},
      appendChild(child) { this.children.push(child); if (child.id) elements.set(child.id, child); },
      addEventListener(name, fn) { this[name] = fn; },
      remove() { elements.delete(this.id); },
      set textContent(text) { this.text = text; this.children = []; },
    };
  }
  const window = { addEventListener: (_, fn) => { listener = fn; } };
  const context = vm.createContext({ window, location: { origin: 'https://testcase.ac' },
    console: { error() {} }, BJHTestcase: protocol, checkEnable: async () => enabled,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    document: { getElementById: id => elements.get(id), createElement: element, body: element() },
    uploadTestcase: async (s) => { if (fail) throw new Error('temporary error'); uploaded.push(s); return 'done'; },
  });
  vm.runInContext(source('content.js'), context);
  const send = (kind, runId, extra = {}, origin = 'https://testcase.ac') => listener({ source: window, origin,
    data: { source: 'bjh-testcase-v1', kind, runId, submission, result: good, ...extra } });
  await send('completed', 'historical');
  await send('submitted', 'foreign', {}, 'https://example.com');
  await send('completed', 'foreign');
  enabled = false;
  await send('submitted', 'disabled');
  enabled = true;
  await send('completed', 'disabled');
  await tick();
  assert.equal(elements.size, 0);
  await send('submitted', 'first');
  await send('completed', 'first');
  await tick();
  const panel = elements.get('bjh-testcase-status');
  assert.match(panel.text, /temporary error/);
  assert.equal(panel.children[0].text, '업로드 재시도');
  assert.equal(timers.size, 0, 'errors with retry remain visible');
  fail = false;
  panel.children[0].click();
  await tick();
  assert.equal(uploaded.length, 1);
  assert.match(panel.text, /done/);
  await send('completed', 'first');
  await tick();
  assert.equal(uploaded.length, 1);
  assert.equal(timers.size, 1);
  const timer = [...timers.values()][0];
  assert.equal(timer.delay, 5000);
  timer.fn();
  assert.equal(elements.has('bjh-testcase-status'), false);
});
