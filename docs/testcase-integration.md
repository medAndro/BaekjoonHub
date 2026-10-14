# testcase.ac / Wayback 연동 검증 (2026-10-14)

- BOJ 공식 루트는 서비스 종료(2010-03-19 ~ 2026-04-28)와 채점 서비스 재개 준비 안내를 표시한다: https://www.acmicpc.net/
- 현재 testcase.ac는 공개 React SPA다. 문제 경로는 `/problems/boj/{id}`, 원본 링크는 `https://www.acmicpc.net/problem/{id}`다.
- 배포된 API 호스트는 `https://api.testcase.ac`. `POST /api/problems/boj/{id}/stress` 요청의 `targetCode`와 `targetCodeLang`으로 실제 제출을 식별할 수 있다.
- 응답은 NDJSON이다. `type: progress`는 판정이 아니며 `type: result`의 `result`만 판정에 사용한다.
- 업로드 조건: `status === not_found`, 양수 정수 `totalCases`, `correctCasesCount === totalCases`, 오답/실행 실패 개수 0. 오류/반례가 있거나 스트림이 중단되면 업로드하지 않는다.
- 이것은 testcase.ac가 실행한 테스트 100% 통과라는 의미다. BOJ 공식 정답 판정을 대신 보장하지 않으며 README에도 출처를 기록한다.
- MAIN world에서 fetch 응답을 복제해 관찰하고, 제출 코드·언어·문제 번호·최종 결과만 isolated world로 전달한다. GitHub 토큰은 MAIN world에 전달하지 않는다.
- 기존 GitHub API 클래스의 fast-forward 재시도, 저장 경로 템플릿, SHA 중복 방지와 업로드 캐시를 재사용한다.
- Wayback 기준 시각은 종료 전인 `20260427000000`. 1000번의 실제 스냅샷(20260426064735)에 제목과 본문이 있음을 확인했다. 모든 문제의 스냅샷 존재는 보장할 수 없다.

공식 소스: https://github.com/testcase-ac/testcase-ac (frontend/src/api.ts, types.ts, pages/ProblemPage.tsx, components/StressResult.tsx)

## 수동 검증

1. Chrome 확장 관리에서 개발자 모드를 켜고 이 폴더를 압축해제 확장으로 로드/새로고침한다. 기존 GitHub 인증과 저장소 연결을 완료하고 확장을 활성화한다.
2. `https://www.acmicpc.net/problem/1000`을 열면 Wayback으로 이동한다. HTTP 및 www 없는 원본 URL도 확인한다.
3. 아카이브의 `testcase.ac에서 실행` 링크와 testcase.ac의 `원본 문제` 링크로 왕복한다. SPA에서 다른 문제로 이동해도 링크가 갱신되는지 확인한다.
4. testcase.ac에서 A+B 정답 코드를 실행한다. 전 케이스 통과 후 GitHub에 코드와 README가 한 커밋으로 저장되는지 확인한다.
5. 실행을 기다리며 에디터를 바꿔도 제출 시점 코드가 올라가는지 확인한다. 동일 코드 재실행은 커밋을 추가하지 않아야 한다.
6. 오답, 컴파일 오류, 중단된 실행, 확장 OFF에서는 업로드하지 않아야 한다. 업로드 실패 시 표시되는 재시도 버튼도 확인한다.

현재 공개 사이트에서 A+B 오답의 최종 결과(정답 일치 77 / 100, 오답 23)를 확인했다. 자동 테스트는 스트림 분할/중단, 판정, 제출 시점 코드, 중복 업로드와 실패 재시도를 검증한다. 실제 사용자 GitHub 저장소로의 업로드는 인증된 브라우저에서 위 절차로 확인해야 한다.
