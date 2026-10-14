const { test } = require('node:test');
const assert = require('node:assert/strict');
const links = require('../scripts/archive/links');
const rules = require('../rules.json');
test('BOJ original and replay URLs identify the same problem', () => {
  for (const url of ['http://acmicpc.net/problem/1000', 'https://www.acmicpc.net/problem/1000?x=1', links.archiveUrl('1000'), 'https://web.archive.org/web/20260426064735id_/http://acmicpc.net/problem/1000']) {
    assert.equal(links.problemId(url), '1000');
  }
  for (const url of ['https://example.com/problem/1000', 'https://www.acmicpc.net/status', 'https://web.archive.org/web/123/https://example.com/problem/1000', 'https://www.acmicpc.net/problem/0']) assert.equal(links.problemId(url), null);
});
test('DNR redirects only top-level problem pages, preserving problem id', () => {
  const rule = rules.find(r => r.action.type === 'redirect');
  const pattern = new RegExp(rule.condition.regexFilter);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
  for (const url of ['http://acmicpc.net/problem/1000', 'https://www.acmicpc.net/problem/1000/?foo=1#bar']) {
    const match = url.match(pattern);
    assert.equal(match[1], '1000');
    assert.equal(rule.action.redirect.regexSubstitution.replace('\\1', match[1]), links.archiveUrl('1000'));
  }
  for (const url of ['https://www.acmicpc.net/status', 'https://www.acmicpc.net/problem/1000/edit', links.archiveUrl('1000')]) assert.equal(pattern.test(url), false);
});
