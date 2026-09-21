# 보안 사전 검사와 수정 인계

2026-09-21. PDF 의존성 편입 전 검사이며 최종 배포 보안 검수는 아니다.

## 의존성

- `npm --prefix prototype audit --json`: info/low/moderate/high/critical 모두 0. 원본 `npm-audit-before-pdf.json` 보존.
- 이때 package-lock.json SHA256: `ba82468a81b08cfef173cedeec49f0f2c3e54a5b8628539bbde0301720bb718c`.
- 이후 PDF 패키지 추가 등 잠금파일이 바뀌면 최종 검사를 새로 수행한다. 알려진 의존성 취약점 0은 전체 서비스의 안전성을 보증하지 않는다.

## 코드에서 확인한 수정 필요 경로

- `api/_vworld.ts:vworldJson`, `api/wms.ts`: 외부 응답 본문·caught error.message를 다시 응답하는 경로가 있다. upstream이 인증값이 포함된 URL을 반환할 경우 노출될 가능성이 있으므로 고정 오류 코드/문구로 제한한다. 실제 비밀값을 읽거나 실패를 유발해 확인하지 않는다.
- `api/generate.ts`: JSON 파싱 실패·prompt 타입·전체 body 크기를 검증하지 않는다. 잘못된 JSON/null/배열/숫자/객체/빈 문자열/초과 크기는 fetch 이전에 거부하고, 가짜 토큰을 포함한 upstream HTTP/SSE/예외 메시지가 응답에 섞이지 않는 테스트를 작성해야 한다.
- 생성 응답의 timeout은 headers 도착 뒤 해제되어 stalled stream 전체 수명을 제한하지 못한다. 읽기 종료·취소·오류를 포함한 cleanup과 55초 제한을 검증한다. 사용자 요청 취소도 upstream으로 전달한다.
- 기존 Edge 런타임/서울 region, 서버 키 보관, 모델 free fallback 정책은 유지한다. 로그인·유료 기능·권한 확대를 추가하지 않는다.

## 이미 한 검사와 남은 범위

초기 repository/로그 패턴 스캔은 별도 work 결과에 보존했다. 최종 공개 사본에는 raw session log, 비밀값, 실제 사내자료를 넣지 않는다. 제출용 실제 JSONL/ZIP은 마지막 스냅샷에서 별도로 점검해야 한다. API 입력/오류 응답 테스트, 수정 후 배포 API 확인, 공개 산출물 최종 검사가 남아 있다.
