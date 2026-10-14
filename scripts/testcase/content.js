(() => {
  const runs = new Map();
  let queue = Promise.resolve();
  function status(message, retry) {
    let panel = document.getElementById('bjh-testcase-status');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'bjh-testcase-status';
      panel.setAttribute('role', 'status');
      panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#fff;color:#111;padding:14px;border:1px solid #175cd3;border-radius:8px;font:14px sans-serif;max-width:360px';
      document.body.appendChild(panel);
    }
    panel.textContent = `BaekjoonHub: ${message}`;
    if (retry) {
      const button = document.createElement('button');
      button.textContent = '업로드 재시도';
      button.addEventListener('click', () => { button.disabled = true; retry(); });
      panel.appendChild(button);
    }
  }
  function enqueue(submission, result) {
    queue = queue.then(async () => {
      status(`${submission.problemId}번 GitHub 업로드 중...`);
      try { status(await uploadTestcase(submission, result)); }
      catch (error) {
        console.error('[BaekjoonHub] testcase.ac upload failed', error);
        status(error.message || '업로드 실패', () => enqueue(submission, result));
      }
    });
  }
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'bjh-testcase-v1' || typeof data.runId !== 'string') return;
    if (data.kind === 'submitted') {
      // Capture enabled state before the result arrives, including for quick responses.
      if (!runs.has(data.runId)) runs.set(data.runId, checkEnable());
      return;
    }
    const enabled = runs.get(data.runId);
    if (!enabled) return;
    runs.delete(data.runId);
    if (data.kind !== 'completed' || !await enabled || !await checkEnable()) return;
    if (BJHTestcase.validSubmission(data.submission) && BJHTestcase.accepted(data.result)) enqueue(data.submission, data.result);
  });
})();
