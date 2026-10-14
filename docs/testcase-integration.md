# testcase.ac / Wayback 연동 검증 (2026-10-14)

- BOJ 공식 루트는 서비스 종료(2010-03-19 ~ 2026-04-28)와 채점 서비스 재개 준비 안내를 표시한다: https://www.acmicpc.net/
- 현재 testcase.ac는 공개 React SPA다. 문제 경로는 `/problems/boj/{id}`, 원본 링크는 `https://www.acmicpc.net/problem/{id}`다.
- 배포된 API 호스트는 `https://api.testcase.ac`. `POST /api/problems/boj/{id}/stress` 요청의 `targetCode`와 `targetCodeLang`으로 실제 제출을 식별할 수 있다.
- 응답은 NDJSON이다. `type: progress`는 판정이 아니며 `type: result`의 `result`만 판정에 사용한다.
- 업로드 조건: `status === not_found`, 양수 정수 `totalCases`, `correctCasesCount === totalCases`, 오답/실행 실패 개수 0. 오류/반례가 있거나 스트림이 중단되면 업로드하지 않는다.
- 이것은 testcase.ac가 실행한 테스트 100% 통과라는 의미다. BOJ 공식 정답 판정을 대신 보장하지 않으며 README에도 출처를 기록한다.
- MAIN world에서 fetch 응답을 복제해 관찰하고, 제출 코드·언어·문제 번호·최종 결과만 isolated world로 전달한다. GitHub 토큰은 MAIN world에 전달하지 않는다.
- 기존 GitHub API 클래스의 fast-forward 재시도, 저장 경로 템플릿, SHA 중복 방지와 업로드 캐시를 재사용한다.
- 기본 저장 경로는 `백준/testcase.ac/{티어}/{번호}. {제목}`이다. 언어별 정리 설정은 적용하지만 기존 BOJ 경로 템플릿은 별도 testcase.ac 경로를 덮어쓰지 않는다. solved.ac 응답은 최대 30초 기다리며 API 요청당 제한은 5초다. 실패하면 `백준/testcase.ac/Unrated`로 임시 저장한다. C++ 파일은 기존 BOJ 방식대로 `.cc` 확장자를 쓴다.
- 실패 시 testcase.ac 콘솔에 `[BaekjoonHub] solved.ac 티어 조회 실패`와 문제 번호, 이유, HTTP 상태(있을 때), 요청 URL이 표시된다. Cloudflare challenge, HTTP 오류(403/404/429 등), 네트워크 오류, 잘못된 JSON/데이터, 응답 대기 시간 초과를 구분한다. 실제 `level: 0`은 성공한 Unrated이며 README에서도 조회 실패와 구분한다.
- 같은 문제를 다시 실행해 전 테스트 통과 후 티어 조회가 성공하면 `백준/testcase.ac/Unrated`에 있던 문제 폴더를 정확한 티어로 자동 이동한다. 기존 `백준/Unrated` 또는 현재 조회된 티어 폴더도 README에 해당 문제의 testcase.ac 실행 링크가 있는 경우 새 testcase.ac 경로로 이동한다. 다른 언어 풀이와 예제 파일을 함께 옮기며, GitHub 이력은 유지한다. 현재 언어/경로 설정과 제목으로 계산한 기존 폴더를 찾으므로 수동으로 이름을 바꾼 폴더까지 탐색하지는 않는다.
- 파일 추가와 기존 경로 삭제는 한 커밋이다. 대상에 서로 다른 추가 파일이 있으면 기존 폴더를 남기고 이동을 보류한다. 파일 목록이 잘렸거나 조회/커밋에 실패하면 삭제하지 않는다. 브랜치 경합 시 최신 부모 커밋에서 파일 목록과 이동 계획을 다시 계산하며 캐시에서 이전 경로도 제거한다.
- Wayback 기준 시각은 종료 전인 `20260427000000`. 1000번의 실제 스냅샷(20260426064735)에 제목과 본문이 있음을 확인했다. 모든 문제의 스냅샷 존재는 보장할 수 없다.

공식 소스: https://github.com/testcase-ac/testcase-ac (frontend/src/api.ts, types.ts, pages/ProblemPage.tsx, components/StressResult.tsx)

## 수동 검증

업데이트 후에는 `chrome://extensions`에서 확장을 새로고침하고, 이미 열려 있던 testcase.ac 탭도 새로고침해야 한다. 확장 버전 `1.4.25`가 표시되는지 확인한다. 이전 탭에는 구버전의 이벤트 리스너가 남을 수 있다.

업로드 완료 또는 동일 코드 중복 안내는 5초 후 자동으로 사라진다. 진행 중 안내와 오류·재시도 버튼은 유지한다. 새 업로드가 시작되면 이전 완료 안내의 닫힘 타이머를 취소한다. 업로드 전 파일 존재 확인 요청의 404는 해당 경로에 파일이 없다는 뜻이며 신규 업로드는 계속 진행한다.

개발 시 `protocol.js` 또는 `bridge.js`를 수정하면 `npm run build:testcase`로 MAIN 전용 `page-bridge.js`를 다시 생성한다. MAIN/ISOLATED에는 서로 다른 파일 URL을 등록한다. 통합 테스트는 실제 manifest의 파일을 별도 실행 환경에 로드하고 리소스 URL 중복 제거 조건에서도 최종 결과 → GitHub 코드/README 커밋 → 캐시 저장을 확인한다.

`BJHTestcase is not defined` 원인: 같은 `protocol.js`를 MAIN/ISOLATED에 등록한 기존 구조에서는 Chrome의 경로 기준 주입 중복 제거에 의해 한 환경에서 누락될 수 있었다. Chromium의 `UserScriptInjector::GetJsSources`는 이미 실행된 `script_url.path()`를 건너뛴다. 이를 별도 MAIN 번들로 해결했다. 또한 testcase 번들에 없던 `getDateString` 호출은 표준 `Date.toISOString()`으로 바꿨다. 참고: https://chromium.googlesource.com/chromium/src/+/refs/tags/132.0.6834.213/extensions/renderer/user_script_injector.cc

1. Chrome 확장 관리에서 개발자 모드를 켜고 이 폴더를 압축해제 확장으로 로드/새로고침한다. 기존 GitHub 인증과 저장소 연결을 완료하고 확장을 활성화한다.
2. `https://www.acmicpc.net/problem/1000`을 열면 Wayback으로 이동한다. HTTP 및 www 없는 원본 URL도 확인한다.
3. 아카이브의 `testcase.ac에서 실행` 링크와 testcase.ac의 `원본 문제` 링크로 왕복한다. SPA에서 다른 문제로 이동해도 링크가 갱신되는지 확인한다.
4. testcase.ac에서 A+B 정답 코드를 실행한다. 전 케이스 통과 후 GitHub에 코드와 README가 한 커밋으로 저장되는지 확인한다.
5. 실행을 기다리며 에디터를 바꿔도 제출 시점 코드가 올라가는지 확인한다. 동일 코드 재실행은 커밋을 추가하지 않아야 한다.
6. 오답, 컴파일 오류, 중단된 실행, 확장 OFF에서는 업로드하지 않아야 한다. 업로드 실패 시 표시되는 재시도 버튼도 확인한다.

현재 공개 사이트에서 A+B 오답의 최종 결과(정답 일치 77 / 100, 오답 23)와 정답 코드의 최종 결과(100 / 100, 오답 0, 실행 실패 0)를 확인했다. 현재 UI에는 통과율 대신 개수가 표시되므로 최종 응답의 개수로 100%를 계산한다. 자동 테스트는 스트림 분할/중단, 판정, 제출 시점 코드, 중복 업로드와 실패 재시도를 검증한다. 실제 사용자 GitHub 저장소로의 업로드는 인증된 브라우저에서 위 절차로 확인해야 한다.
