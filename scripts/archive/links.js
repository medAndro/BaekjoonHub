/* Shared URL parsing: only BOJ problem documents are redirected. */
const BJHArchive = (() => {
  const snapshot = '20260427000000';
  function problemId(value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      if (['acmicpc.net', 'www.acmicpc.net'].includes(url.hostname)) {
        return url.pathname.match(/^\/problem\/([1-9]\d*)\/?$/)?.[1] || null;
      }
      if (url.hostname === 'web.archive.org') {
        const original = url.pathname.match(/^\/web\/(?:\d{1,14}(?:[a-z]+_)?|\*)\/(https?:\/\/(?:www\.)?acmicpc\.net\/problem\/[1-9]\d*\/?$)/i);
        return original ? problemId(original[1]) : null;
      }
    } catch (_) { /* unrelated or invalid URL */ }
    return null;
  }
  function archiveUrl(id) {
    return `https://web.archive.org/web/${snapshot}/https://www.acmicpc.net/problem/${id}`;
  }
  function testcaseUrl(id) {
    return `https://testcase.ac/problems/boj/${id}`;
  }
  return { problemId, archiveUrl, testcaseUrl };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BJHArchive;
