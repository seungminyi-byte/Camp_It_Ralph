# 용도지역 출처 정합성 수정 인계

기준: `389f0cd` 위의 의미 요약 단계 미커밋 변경을 보존한 작업 트리. 커밋·push·배포·브라우저 조작은 하지 않았다.

## 변경

- `engine.ts`에 `landUseEvidence`를 추가했다. 유효 자동 조회는 auto + found + 조회값/적용값 일치 + 적용값 non-unknown일 때만 `available/public_data/공개 조회`다.
- 수동은 `unknown/user_input/사용자 입력`, 그 밖의 자동 실패·미해당·불일치·unknown 및 source 생략은 `unknown/unverified/출처 미확인`으로 통일했다.
- 이 값은 zoning evidence status/detail과 `land-use.ordinance` issue basis/detail에 공통 적용한다.
- `engine.test.ts`에 경계표를 먼저 추가했다. 정상 인천 주거지역 auto fixture는 zoning도 `residential`로 맞췄고, 불일치 fixture는 `unverified`를 검증한다.

점수·산식·감점·제한·등급과 후보 source 전달 코드에는 변경이 없다. `pins.ts`는 이미 manual 또는 일치하는 zoning을 source input에 전달하고, 엔진이 최종 출처 표시를 판정하므로 그대로 두었다.

## 증거

- 수정 전 새 엔진 테스트: 59개 중 7개 실패. 원인은 evidence detail 및 ordinance basis가 단순 auto 여부로 공개조회/public_data를 표시한 것.
- 수정 후 엔진: 59개 통과.
- portable Node v24.21.0으로 typecheck·lint 통과.
- 엔진·후보·보고서 체크리스트·통합: 4파일 82개 통과.
- 세부 기록: `ralphathon/evidence/source-integrity/RESULTS.md`.

이 제한 수정에서는 전체 Vitest와 production build를 실행하지 않았다. 총괄 최종 검사에서 별도로 실행하고 기록해야 한다.
