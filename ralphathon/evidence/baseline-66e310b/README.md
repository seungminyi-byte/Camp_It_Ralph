# 변경 전 기준 검증

- 커밋: 66e310b9f889b9dca4de5cd1b79e5830d69063b1 (prototype)
- 실행: 2026-09-21 16:33 KST, Windows / Node v24.21.0 / npm 11.19.0 / Python 3.14
- npm ci: 79 packages, audit 80 packages, 0 vulnerabilities. esbuild postinstall 미승인 경고가 있었으나 실제 typecheck/test/build는 성공. 권한 변경 없음.
- typecheck / lint / Vitest 19 files 166 tests / validate_out / production build 모두 exit 0.
- 산출물: JS 467.81kB (gzip 145.08kB), CSS 72.09kB (gzip 19.25kB). Lighthouse 점수가 아님.
- data.txt는 Windows Python 출력 인코딩으로 한국어가 깨짐. 확인 가능성을 위해 PYTHONUTF8=1, PYTHONIOENCODING=utf-8로 데이터 검사만 재실행해 data-utf8.txt 기록. 동일 검사 전체 통과. 나머지 검사는 이유 없이 반복하지 않음.
- data-hashes.json은 작업 전 커밋된 앱 번들의 SHA256. 실제 공개자료 새로 수집하지 않음.
- 이 결과는 변경 전 기준점이다. 향후 변경의 완료를 증명하지 않는다.
