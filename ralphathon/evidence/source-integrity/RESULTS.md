# 용도지역 출처 정합성 수정 증거

기준 HEAD: `389f0cd`와 의미 요약 단계의 미커밋 변경을 보존한 작업 트리. 작업 범위는 `prototype/src/scoring/engine.ts`, `engine.test.ts` 및 이 기록이다.

## 먼저 작성한 실패 기대

`prototype`에서 portable Node v24.21.0을 PATH 앞에 둔 뒤 다음을 실행했다.

```powershell
node node_modules/vitest/vitest.mjs run src/scoring/engine.test.ts
```

새 경계 테스트는 자동 조회가 유효하려면 `landUseSource === 'auto'`, `zoning.found`, 조회값과 적용값 일치, 적용값이 `unknown`이 아님을 모두 요구한다. 자동 조회 누락·미해당·값 불일치·`unknown`, 수동, 출처 생략을 증거 상세과 조례 검토에 각각 검증했다.

수정 전 결과는 59개 중 7개 실패였다. 자동 조회 누락·미해당·값 불일치·`unknown`의 evidence detail이 `공개 조회`로 남았고, 조례 검토의 누락·미해당·불일치 3건은 `basis: public_data`로 남았다. 이때 evidence status는 이미 `unknown`이어서 문구와 근거 분류가 서로 모순됨을 확인했다.

정상 자동조회 조례 fixture는 인천 주거지역의 적용값과 zoning 응답값을 모두 `residential`로 넣었다. 불일치 fixture의 기대를 공개자료로 바꿔 실패를 숨기지 않았다.

## 수정과 재검증

엔진에 `landUseEvidence` 한 변수를 두어 다음을 함께 사용한다.

| 조건 | evidence status | basis | 표시 |
| --- | --- | --- | --- |
| 유효 자동 조회 | `available` | `public_data` | 공개 조회 |
| 수동 | `unknown` | `user_input` | 사용자 입력 |
| 자동 조회 누락·미해당·불일치·unknown, 출처 생략 | `unknown` | `unverified` | 출처 미확인 |

이 변수는 용도지역 evidence availability/detail 및 `land-use.ordinance` issue의 basis/detail에 공통 사용한다. 점수, 감점, 제한, 등급, 산식은 변경하지 않았다.

재실행 결과:

```text
src/scoring/engine.test.ts: 1 file, 59 tests passed
typecheck: passed
lint: passed
engine + pins + checklist + integration: 4 files, 82 tests passed
```

`pins.ts`의 저장 후보 source 계산도 읽어 확인했다. 핀의 수동값 또는 zoning 조회값 일치 여부를 input으로 전달하며, 새 엔진 해석이 실제 evidence/issue 표시를 최종 판정하므로 동작 변경은 필요하지 않았다.

전체 Vitest와 production build는 이 제한 수정에서 새 원인이 없으므로 넓히지 않았다. 총괄 최종 검사 단계에서 전체 테스트·build를 별도로 실행해야 한다.
