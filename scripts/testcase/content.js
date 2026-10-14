(() => {
  const runs = new Map();
  let queue = Promise.resolve();
  let dismissTimer;
  function status(message, retry, autoDismiss = false) {
    clearTimeout(dismissTimer);
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
    if (autoDismiss) dismissTimer = setTimeout(() => panel.remove(), 5000);
  }
  function enqueue(submission, result) {
    queue = queue.then(async () => {
      try {
        status(`${submission.problemId}번 GitHub 업로드 중...`);
        status(await uploadTestcase(submission, result), null, true);
      }
      catch (error) {
        console.error('[BaekjoonHub] testcase.ac upload failed', error);
        status(error.message || '업로드 실패', () => enqueue(submission, result));
      }
    });
  }
  window.addEventListener('message', async event => {
    try {
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
      if (!globalThis.BJHTestcase) throw new Error('판정 모듈이 로드되지 않았습니다. 확장과 testcase.ac 페이지를 새로고침해주세요.');
      if (globalThis.BJHTestcase.validSubmission(data.submission) && globalThis.BJHTestcase.accepted(data.result)) enqueue(data.submission, data.result);
    } catch (error) {
      console.error('[BaekjoonHub] testcase.ac result handling failed', error);
      status(error.message || '실행 결과 처리에 실패했습니다.');
    }
  });
})();
