const debug = false;

function testcaseTier(level) {
  if (level === 31) return 'Master';
  if (!Number.isInteger(level) || level < 1 || level > 30) return 'Unrated';
  return `${['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'][Math.floor((level - 1) / 5)]} ${['V', 'IV', 'III', 'II', 'I'][(level - 1) % 5]}`;
}

async function testcaseMetadata(problemId) {
  if (typeof chrome === 'undefined') return null;
  let timer;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ sender: 'baekjoon', task: 'SolvedApiCall', problemId: Number(problemId), detailed: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('solved.ac 응답 대기 시간 30초 초과')), 30000); }),
    ]);
    if (!response?.ok) {
      console.warn('[BaekjoonHub] solved.ac 티어 조회 실패 → Unrated 임시 저장', { problemId, ...(response?.error || { reason: 'empty_response' }) });
      return null;
    }
    console.info('[BaekjoonHub] solved.ac 티어 조회 성공', { problemId, tier: testcaseTier(response.data.level) });
    return response.data;
  } catch (error) {
    console.warn('[BaekjoonHub] solved.ac 티어 조회 실패 → Unrated 임시 저장', { problemId, reason: 'message_or_timeout_error', message: error.message });
    return null;
  }
  finally { clearTimeout(timer); }
}

async function makeTestcaseData(submission, result, metadata = null) {
  const [language, extension] = globalThis.BJHTestcase.languages[submission.language];
  const title = convertSingleCharToDoubleChar(submission.title);
  const levelFull = testcaseTier(metadata?.level), level = levelFull.split(' ')[0];
  const directory = await buildDirectory('testcase', {
    platform: '백준', id: submission.problemId, problemId: submission.problemId, title, level, levelFull, language,
    _defaultDir: `백준/testcase.ac/${level}/${submission.problemId}. ${title}`,
  });
  const archive = globalThis.BJHArchive.archiveUrl(submission.problemId);
  const link = globalThis.BJHArchive.testcaseUrl(submission.problemId);
  const readme = `# ${submission.title} - ${submission.problemId}\n\n` +
    `티어: ${metadata ? levelFull : '조회 실패 (Unrated 임시 저장)'}\n\n` +
    `[문제 아카이브](${archive}) · [testcase.ac 실행](${link})\n\n` +
    `### 테스트 결과\n\n` +
    `testcase.ac 테스트 100% 통과 (${result.correctCasesCount}/${result.totalCases}).\n` +
    `BOJ 공식 채점 결과가 아니며 실행된 테스트에서 반례를 찾지 못했다는 뜻입니다.\n\n` +
    `언어: ${language}\n\n실행 ID: ${result.requestId || '미제공'}\n\n` +
    `실행 전체 소요 시간: ${Number.isFinite(result.runtimeSeconds) ? result.runtimeSeconds + '초' : '미제공'}\n\n` +
    `업로드 일자: ${new Date().toISOString()}\n`;
  return { directory, fileName: `${title}.${extension}`, code: submission.code, readme,
    message: `[testcase.ac 100%] ${submission.problemId}. ${submission.title} -BaekjoonHub` };
}

async function uploadTestcase(submission, result) {
  if (!globalThis.BJHTestcase.validSubmission(submission) || !globalThis.BJHTestcase.accepted(result)) throw new Error('통과한 제출이 아닙니다.');
  if (!await checkEnable()) throw new Error('확장이 비활성화되어 있습니다.');
  const hook = await getHook(), token = await getToken();
  if (!hook || !token) throw new Error('BaekjoonHub에서 GitHub 인증과 저장소 연결을 완료해주세요.');
  const metadata = await testcaseMetadata(submission.problemId);
  const data = await makeTestcaseData(submission, result, metadata);
  const path = `${data.directory}/${data.fileName}`;
  // Query the current repository as well as local state; deleted remote files can be restored.
  const remote = await getFile(hook, token, path);
  const sameCode = remote?.sha === calculateBlobSHA(data.code);
  const old = await makeTestcaseData(submission, result, null);
  const legacyDirectories = [];
  for (const level of new Set(['Unrated', testcaseTier(metadata?.level).split(' ')[0]])) {
    legacyDirectories.push(await buildDirectory('baekjoon', {
      platform: '백준', id: submission.problemId, problemId: submission.problemId,
      title: convertSingleCharToDoubleChar(submission.title), level,
      levelFull: level === 'Unrated' ? 'Unrated' : testcaseTier(metadata?.level),
      language: globalThis.BJHTestcase.languages[submission.language][0],
      _defaultDir: `백준/${level}/${submission.problemId}. ${convertSingleCharToDoubleChar(submission.title)}`,
    }));
  }
  const candidates = [...new Set([old.directory, ...legacyDirectories])].filter(dir => dir !== data.directory);
  const canMove = candidates.length > 0;
  if (sameCode && !canMove) return '동일한 코드가 이미 업로드되어 있습니다.';
  const git = new GitHub(hook, token);
  const branch = await git.getDefaultBranchOnRepo();
  const source = await git.createBlob(data.code, path);
  const readme = await git.createBlob(data.readme, `${data.directory}/README.md`);
  let moved = false, conflict = false, movedFrom = [];
  const committed = await git.commitTreeItems(branch, canMove ? async parentSHA => {
    moved = false; conflict = false; movedFrom = [];
    const snapshot = await git.getTreeWithTruncation(parentSHA);
    if (snapshot.truncated) throw new Error('GitHub 파일 목록이 불완전하여 안전하게 경로를 이동할 수 없습니다.');
    const files = snapshot.tree.filter(item => item.type === 'blob');
    const known = new Map(files.map(item => [item.path, item.sha]));
    const sameAtParent = known.get(path) === calculateBlobSHA(data.code);
    const directories = [];
    for (const directory of candidates) {
      if (!files.some(item => item.path.startsWith(`${directory}/`))) continue;
      if (directory !== old.directory) {
        // Legacy BOJ folders may contain official BOJ submissions. Check attribution
        // at the same pinned parent used for the move before touching their files.
        const attribution = await getFile(hook, token, `${directory}/README.md`, parentSHA);
        if (attribution?.encoding !== 'base64' || !attribution.content || !atob(attribution.content.replace(/\s/g, '')).includes(`testcase.ac/problems/boj/${submission.problemId}`)) continue;
      }
      directories.push(directory);
    }
    const oldFiles = files.filter(item => directories.some(dir => item.path.startsWith(`${dir}/`)));
    const destination = item => {
      const from = directories.find(dir => item.path.startsWith(`${dir}/`));
      return data.directory + item.path.slice(from.length);
    };
    const replacements = new Set([path, `${data.directory}/README.md`]);
    const planned = new Map(known);
    for (const item of oldFiles) {
      const target = destination(item);
      if (!replacements.has(target) && planned.has(target) && planned.get(target) !== item.sha) conflict = true;
      planned.set(target, item.sha);
    }
    if (conflict) {
      console.warn('[BaekjoonHub] 티어 폴더 이동 보류: 대상 파일과 내용이 달라 기존 경로의 원본을 유지합니다.', { problemId: submission.problemId, from: directories, to: data.directory });
      return sameAtParent ? [] : [source, readme];
    }
    if (!oldFiles.length) return sameAtParent ? [] : [source, readme];
    moved = true;
    movedFrom = directories;
    const items = [source, readme];
    for (const item of oldFiles) {
      const target = destination(item);
      if (!replacements.has(target) && !known.has(target)) {
        items.push({ path: target, sha: item.sha, mode: item.mode, type: 'blob' });
        known.set(target, item.sha);
      }
      items.push({ path: item.path, sha: null, mode: item.mode, type: 'blob' });
    }
    return items;
  } : [source, readme], data.message);
  if (committed.unchanged) return conflict ? '동일 코드가 존재합니다. 경로 이동 충돌로 기존 원본을 유지했습니다.' : '동일한 코드가 이미 업로드되어 있습니다.';
  await recordUploadInStats(hook, branch, committed.treeItems || [source, readme]);
  if (moved) console.info('[BaekjoonHub] 티어 폴더 이동 완료', { problemId: submission.problemId, from: movedFrom, to: data.directory });
  if (conflict) return 'GitHub 업로드 완료 (경로 이동 충돌: 기존 원본 유지)';
  if (moved) return `GitHub 업로드 완료 (testcase.ac/${testcaseTier(metadata?.level)} 경로로 이동)`;
  return 'GitHub 업로드 완료 (testcase.ac 100% 통과)';
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeTestcaseData, uploadTestcase, testcaseTier };
