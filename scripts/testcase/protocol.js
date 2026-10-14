const BJHTestcase = (() => {
  const languages = {
    cpp23: ['C++23', 'cc'], cpp20: ['C++20', 'cc'], cpp17: ['C++17', 'cc'], cpp14: ['C++14', 'cc'],
    c11: ['C11', 'c'], c99: ['C99', 'c'], python3: ['Python 3', 'py'], pypy3: ['PyPy 3', 'py'],
    java: ['Java', 'java'], nodejs: ['JavaScript', 'js'], golang: ['Go', 'go'], kotlin: ['Kotlin', 'kt'],
    rust2021: ['Rust', 'rs'], csharp: ['C#', 'cs'],
  };
  function accepted(result) {
    return !!result && result.status === 'not_found' && !result.errorMessage &&
      Number.isSafeInteger(result.totalCases) && result.totalCases > 0 &&
      result.correctCasesCount === result.totalCases && result.wrongCasesCount === 0 &&
      result.executionFailedCasesCount === 0 &&
      ['wrongCases', 'executionFailedCases', 'counterexamples'].every(key => !result[key] || (Array.isArray(result[key]) && result[key].length === 0)) &&
      !result.counterexample;
  }
  function validSubmission(value) {
    return !!value && /^[1-9]\d*$/.test(value.problemId) && typeof value.code === 'string' &&
      value.code.trim().length > 0 && Object.hasOwn(languages, value.language) &&
      typeof value.title === 'string';
  }
  // Read the entire stream before accepting a result; truncated/error streams must not upload.
  async function readResult(response) {
    if (!response.ok || !response.body) throw new Error('No successful response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '', finalResult = null;
    function line(text) {
      if (!text.trim()) return;
      if (finalResult) throw new Error('Data after final result');
      const record = JSON.parse(text);
      if (record.type === 'progress') return;
      if (record.type !== 'result' || !record.result || typeof record.result !== 'object') throw new Error('Invalid result record');
      finalResult = record.result;
    }
    try {
      for (;;) {
        const { value, done } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let end;
        while ((end = pending.indexOf('\n')) !== -1) {
          line(pending.slice(0, end));
          pending = pending.slice(end + 1);
        }
        if (pending.length > 16 * 1024 * 1024) throw new Error('Oversized result record');
        if (done) break;
      }
      line(pending);
      if (!finalResult) throw new Error('Missing final result');
      return finalResult;
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally { reader.releaseLock(); }
  }
  return { languages, accepted, validSubmission, readResult };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BJHTestcase;
