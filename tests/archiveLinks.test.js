const { test } = require('node:test');
const assert = require('node:assert/strict');
const links = require('../scripts/archive/links');
const rules = require('../rules.json');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
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

test('navigation updates newly rendered SPA links and adds one archive execution link', () => {
  const code = fs.readFileSync(path.join(__dirname, '../scripts/archive/navigation.js'), 'utf8');
  let refresh;
  const anchors = [{ href: 'https://www.acmicpc.net/problem/1000' }, { href: 'https://example.com/problem/1000' }];
  vm.runInNewContext(code, { BJHArchive: links, URL, location: { hostname: 'testcase.ac' },
    document: { querySelectorAll: () => anchors, documentElement: {} },
    MutationObserver: class { constructor(fn) { refresh = fn; } observe() {} },
  });
  assert.equal(anchors[0].href, links.archiveUrl('1000'));
  anchors.push({ href: 'http://acmicpc.net/problem/1001' });
  refresh();
  assert.equal(anchors[2].href, links.archiveUrl('1001'));
  assert.equal(anchors[1].href, 'https://example.com/problem/1000');
  const children = [];
  vm.runInNewContext(code, { BJHArchive: links, location: { hostname: 'web.archive.org', href: links.archiveUrl('1000') },
    document: { getElementById: () => children[0], createElement: () => ({ style: {} }),
      body: { appendChild: child => children.push(child) }, documentElement: {} },
    MutationObserver: class { constructor(fn) { refresh = fn; } observe() {} },
  });
  refresh();
  assert.equal(children.length, 1);
  assert.equal(children[0].href, links.testcaseUrl('1000'));
});
