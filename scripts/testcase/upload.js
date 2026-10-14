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
    return await Promise.race([
      chrome.runtime.sendMessage({ sender: 'baekjoon', task: 'SolvedApiCall', problemId: Number(problemId) }),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); }),
    ]);
  } catch (_) { return null; }
  finally { clearTimeout(timer); }
}

async function makeTestcaseData(submission, result, metadata = null) {
  const [language, extension] = globalThis.BJHTestcase.languages[submission.language];
  const title = convertSingleCharToDoubleChar(submission.title);
  const levelFull = testcaseTier(metadata?.level), level = levelFull.split(' ')[0];
  const directory = await buildDirectory('baekjoon', {
    platform: '백준', id: submission.problemId, problemId: submission.problemId, title, level, levelFull, language,
    _defaultDir: `백준/${level}/${submission.problemId}. ${title}`,
  });
  const archive = globalThis.BJHArchive.archiveUrl(submission.problemId);
  const link = globalThis.BJHArchive.testcaseUrl(submission.problemId);
  const readme = `# ${submission.title} - ${submission.problemId}\n\n` +
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
  const data = await makeTestcaseData(submission, result, await testcaseMetadata(submission.problemId));
  const path = `${data.directory}/${data.fileName}`;
  // Query the current repository as well as local state; deleted remote files can be restored.
  const remote = await getFile(hook, token, path);
  if (remote?.sha === calculateBlobSHA(data.code)) return '동일한 코드가 이미 업로드되어 있습니다.';
  const git = new GitHub(hook, token);
  const branch = await git.getDefaultBranchOnRepo();
  const source = await git.createBlob(data.code, path);
  const readme = await git.createBlob(data.readme, `${data.directory}/README.md`);
  await git.commitTreeItems(branch, [source, readme], data.message);
  await recordUploadInStats(hook, branch, [source, readme]);
  return 'GitHub 업로드 완료 (testcase.ac 100% 통과)';
}

if (typeof module !== 'undefined' && module.exports) module.exports = { makeTestcaseData, uploadTestcase, testcaseTier };
