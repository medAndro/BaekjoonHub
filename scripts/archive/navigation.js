(() => {
  function refresh() {
    if (location.hostname === 'testcase.ac') {
      for (const link of document.querySelectorAll('a[href]')) {
        const id = BJHArchive.problemId(link.href);
        if (id && new URL(link.href).hostname !== 'web.archive.org') {
          link.href = BJHArchive.archiveUrl(id);
          link.title = 'Wayback Machine에서 문제 보기';
        }
      }
      return;
    }
    const id = BJHArchive.problemId(location.href);
    if (!id || document.getElementById('bjh-testcase-link')) return;
    const link = document.createElement('a');
    link.id = 'bjh-testcase-link';
    link.href = BJHArchive.testcaseUrl(id);
    link.textContent = `testcase.ac에서 실행 (${id}번)`;
    link.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#175cd3;color:white;padding:12px 16px;border-radius:8px;font:14px sans-serif;box-shadow:0 2px 8px #555';
    document.body.appendChild(link);
  }
  refresh();
  // SPA navigation and newly rendered problem links.
  new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true });
})();
