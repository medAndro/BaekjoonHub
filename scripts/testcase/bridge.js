/* MAIN world only. Never pass extension credentials into this world. */
(() => {
  const nativeFetch = window.fetch;
  let sequence = 0;
  const emit = (kind, runId, data) => window.postMessage({ source: 'bjh-testcase-v1', kind, runId, ...data }, location.origin);
  window.fetch = async function(input, init) {
    let capture = null;
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      const match = url.pathname.match(/^\/api\/problems\/boj\/([1-9]\d*)\/stress$/);
      const pageId = location.pathname.match(/^\/problems\/boj\/([1-9]\d*)\/?$/)?.[1];
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === 'https://api.testcase.ac' && match && match[1] === pageId && method === 'POST') {
        const runId = `run-${++sequence}`;
        const title = document.querySelector('main h1')?.textContent?.trim() || `문제 ${pageId}`;
        const body = init?.body !== undefined ? Promise.resolve(init.body) : input.clone().text();
        capture = body.then(text => {
          const payload = JSON.parse(text);
          const submission = { problemId: pageId, title, code: payload.targetCode, language: payload.targetCodeLang };
          if (!globalThis.BJHTestcase.validSubmission(submission)) return null;
          emit('submitted', runId, {});
          return { runId, submission };
        }).catch(() => null);
      }
    } catch (_) { /* Preserve page requests even if observation fails. */ }
    let response;
    try { response = await nativeFetch.apply(this, arguments); }
    catch (error) {
      if (capture) void capture.then(run => { if (run) emit('failed', run.runId, {}); });
      throw error;
    }
    if (capture) {
      let copy;
      try { copy = response.clone(); }
      catch (_) {
        void capture.then(run => { if (run) emit('failed', run.runId, {}); });
        return response;
      }
      void (async () => {
        const run = await capture;
        if (!run) { await copy.body?.cancel(); return; }
        try {
          const result = await globalThis.BJHTestcase.readResult(copy);
          emit('completed', run.runId, { submission: run.submission, result });
        } catch (_) {
          emit('failed', run.runId, {});
        }
      })().catch(() => {});
    }
    return response;
  };
})();
