# 04B AI 신뢰성·안전 표시 구현 인계

- 실행자: `ai_evidence_reliability` — 총괄 지정 Astra/xhigh, 추가 위임 없음.
- 기준: `codex/ralph-goal-20260921`, 시작 HEAD `b00f11d`(04A).
- 시작 확인: 2026-09-21 19:00:56 KST. 인계 준비: 19:20 KST 전후, 사용자 마감 2026-09-22 10:00 KST까지 약 14시간 40분.
- 상태: 아래 코드·합성 검증을 완료하여 총괄 검수에 반환한다. 커밋·푸시·PR·배포·외부 AI 호출·최종 제출은 수행하지 않았다.

## 1. 범위와 결정

저장소 및 작업 루트 AGENTS, 원문 목표, 런북, G003/G005/G007, 설계 §4~6, 04A 인계와 `work/client-prep`의 독립 기대값을 적용했다. 엔진 산식·상수·서버 allowlist·04A 온라인 hook/cache 계약·원문·사진·총괄 상태 문서는 변경하지 않았다.

설계 반론을 총괄에 전달하고 다음 구분을 채택했다.

1. **구조 / 실행 완료 / 현재 문맥 / 대표 대조**는 별도 조건이다. `parseMemo.complete`는 구조 충족이며 사실 검증이나 정상 종료를 뜻하지 않는다.
2. 입력 프롬프트의 중복을 줄여도 **v4 전체 입력·결과·체크리스트 서명은 그대로 유지**한다. 법적 분류·원문 명칭·직접/주변 관계·mappingVersion·출처·날짜·partial/stale가 바뀌면 기존 서명이 달라진다.
3. 수치의 전체 집합으로 의견을 허용하지 않는다. 엔진 결과에서 읽은 **같은 항목·단위·의미·명시된 금융 조건 관계**를 대조한다. 보수적 보류가 있을 수 있으며 모든 자연어 의미를 검증했다는 표현을 사용하지 않는다.
4. 기본 보고서와 AI를 분리한다. 정상 완료·현재 문맥·구조 정상·대조 flag 없음일 때만 사용자가 체크해 별도 부록에 넣는다.

## 2. 제품 변경

### 2.1 전송 경계 (`genai/llmClient.ts`)

- 클라이언트 65초 타이머 하나가 응답 헤더, 매 본문 읽기, 선택적 사전 의견 파일 조회까지 포함한다. 서버의 전체 55초/idle 15초 및 무료 모델 allowlist는 변경하지 않았다.
- 본문 128KiB, UTF-8 엄격 디코딩, text/plain 형식, 비어 있는 본문, 분할 도착한 `## ERROR`, 연결 중단, 시간 초과와 사용자 abort를 구분한다.
- 모든 완료·실패·취소 경로에서 타이머·부모 listener·reader lock을 정리하고 body를 취소한다. 헤더가 도착한 직후 abort되는 경합에서도 아직 인계되지 않은 응답 body를 취소한다.
- 정상 proxy 1회 후 실패한 경우에만 v4 사전 파일 1회를 확인한다. 자동 재시도 반복이나 유료 전환은 없다. 사전 파일도 2MiB 크기 한도와 같은 전체 제한시간을 사용한다.
- 사전 의견은 contextKey 완전 일치와 기존 반경 300m 조건을 모두 요구한다. 빈값·오류 마커·잘못된 좌표·과대 텍스트는 거부한다.
- **API 변경:** `GenerateOptions.onReplace(text)`가 필수다. fallback은 `onText`로 이어 붙이지 않고 `onReplace(pre.text)`로 실패 초안을 원자적으로 교체한다. 독립 probe는 `buffer = text`로 연결해야 한다.

### 2.2 문맥·실행 수명 (`components/MemoPanel.tsx`, `App.tsx`)

- 실행 generation과 문맥 revision을 단조 증가시킨다. 새 실행, 중단, 입력/근거 변화, 변경 후 되돌림, 동일 후보 재선택, 동일 query 재요청 및 unmount 뒤 과거 콜백은 현재 실행을 수정할 수 없다.
- 비동기 해시가 끝난 직후, 첫/매 청크, 교체, mode, done, error 및 React state updater 내부에서 동일 run/revision/context/abort/mount를 확인한다.
- `streaming / done / error / stopped`를 구분한다. stopped는 검토용 원문을 볼 수 있지만 완료/부록 적격이 아니다. transport가 정상 반환해도 빈 visible 본문이나 parsed error가 있으면 오류다.
- `App`은 기존 `selectionRevision`과 각 lookup의 `queryKey / selectionRevision / requestRevision / status`를 MemoPanel에 전달한다. lookup이 null인 채 loading/error/partial로 바뀌는 경우에도 AI를 무효화한다. 04A hook이 보존하는 관찰 및 provenance를 바꾸지 않는다.

### 2.3 프롬프트와 크기 (`genai/prompts.ts`)

- full input/result/checklist dump를 항목 근거, 계산 결과, 입력 가정, 사용자 협의 기록, 출처·법적 분류·온라인 상태로 투영한다.
- 협의 note 3개는 각 1회만 포함하며 미검증 사용자 자료로 구획한다. note·주소·기사 속 지시는 따르지 않도록 명시한다. note나 주요 근거에 substring/slice로 잘라내기를 적용하지 않는다.
- 반복 URL은 `source#번호`와 원 URL 배열로 공유한다. 법적 mapping의 현재 관찰이 참조하지 않는 출처 목록과 출력 헤더의 반복 설명만 제외한다. 현재 관찰의 적용 출처·법령 날짜·원문 관계는 유지하며 v4 서명은 전체 원본을 계속 포함한다.
- 20,000 UTF-16 문자 및 JSON 요청 96KiB를 요청 전 검사한다. 초과 시 네트워크 요청 없이 안내하고 입력·기본 보고서를 유지한다. 서버 상한은 그대로다.
- 최종 12조건 측정: 대표 3후보 × 빈/최대 note × 일반/문화유산 review+reference·partial·stale. 30,000㎡/10,000㎡/200%/50%/4층/차입잔액 1,000억원 입력을 함께 사용했다.

| 조건 | UTF-16 문자 | JSON 요청 UTF-8 bytes | 결과 |
|---|---:|---:|---|
| 일반·빈 note | 11,184~11,505 | 18,249~18,755 | 모두 상한 이내 |
| 일반·note 3×2,000자 | 17,223~17,544 | 36,254~36,760 | note 각 1회·원문 유지 |
| 혼합·부분·과거관찰·빈 note | 13,102~13,423 | 21,417~21,923 | provenance 유지 |
| 혼합·부분·과거관찰·note 3×2,000자 | 19,141~19,462 | 39,422~39,928 | 모두 상한 이내·note 원문 유지 |

측정 근거: `work/evidence/04B-prompt-matrix.json`. 임의의 더 많은 관찰이나 긴 주소까지 항상 20,000자 이하라고 보장하지 않으며, 초과 경로는 별도 DOM 회귀로 확인했다.

### 2.4 구조·대표 대조 (`memoFormat.ts`, `memoValidation.ts`)

- unknown ITEM은 `unmapped`에 보존하고 어느 checklist 항목에도 배정하지 않는다. 중복 항목은 `duplicates`에 남긴다. 필수 OVERALL·18 ITEM·ACTIONS·CAVEATS 구조가 모두 있어야 complete다.
- 수치 fact는 기존 엔진 결과를 읽는다. 금융 산식을 새로 계산하지 않으며 명시된 금리·개월·비용은 `finance.cells`의 같은 행/열 관계로 대조한다.
- 60억원↔6,000,000,000원, km↔m 등 단위 정규화만 수행한다. 다른 항목의 60, 금융비용의 60%, 600억원, 결측 비용→0, 다른 금리 행의 비용을 차단한다. 같은 항목에서도 가장 구체적인 비용명과 최소 대지/연면적, 사람/가구 단위를 구분한다.
- 날짜·조문·명시적 주소·목록 순번은 측정 수치와 분리한다. 알 수 없는 bare 숫자, 미지원 표현/단위, 전체 의견·조치·한계의 수치는 보수적으로 검토 대상으로 둔다.
- 공급 MW 확정, 한전 공식 승인, 허가 확정, 사업 적합·안전 확정, 미측정 절감 효과, 대표적인 작성 지시를 flag로 표시한다. ‘아직 확인되지 않음’, ‘확정된 것은 아님’은 확정 주장으로 오인하지 않는다. 앞 절 부정이 뒤 절 공급 보장을 가리지 않도록 양보/대조 절을 분리한다.
- 대표 regex/typed-fact 대조다. 한글 수사·모든 동의어·장거리 지시대명사·복잡한 다중 시나리오·모든 법적 주장의 의미를 완전 검증하지 않는다. 수치 없는 정교한 허위 서술까지 전부 검출한다고 주장하지 않는다. 이 한계를 화면과 부록에 표시한다.

### 2.5 보고서 소비 및 안전 표시

- `ChecklistReport`의 기본 `memoEligible=false`, `includeAiAppendix=false`. MemoPanel이 계산한 적격 결과와 현재 실행에 대한 명시적 선택이 모두 있어야 부록이 렌더된다.
- 기본 근거 표에 `memo.items`를 끼워 넣지 않는다. 전체 AI 항목은 선택 부록 안에만 나타난다. 오류·부분·중단·stale·unmapped·flag 결과는 print tree에도 전달하지 않는다.
- `SafeExternalLink` / `safeExternalUrl`은 명시적 http/https만 허용하고 control 문자·인증정보 포함 URL 등을 거부한다. 안전한 링크는 `target=_blank` 및 `noopener noreferrer`, 거부한 링크는 일반 span 텍스트다.
- AnalysisDetails의 뉴스/사례, ReviewFacts의 출처, MapView의 공개 시설/사례 popup, ChecklistReport 출처에 적용했다. 정적 지도 attribution은 기존 신뢰된 문자열로 유지했다.
- AI와 외부 원문은 React 텍스트로 표시한다. dangerous HTML 렌더링을 추가하지 않았다.

## 3. 실패 → 수정 → 검증

1. 총괄의 기존 독립 baseline에서 unknown ITEM 오배정, 오류 본문과 fallback 결합, 허용 note의 36,139~37,157자 초과가 재현되어 있었다. 기대값은 변경하지 않았다.
2. 자체 첫 신규 검사에서 53건 중 2실패: `입력 대지에서 5,000㎡가 부족`을 입력 대지값으로 오인했고, 헤더 도착 직후 abort 시 아직 전달되지 않은 body가 취소되지 않았다. 부족이라는 뒤 문맥을 우선하고, fetch가 관찰한 응답의 실패 경로 취소를 추가했다. 이후 해당 65검사 통과. 원래 실패 출력은 `04B-first-genai.log`에 보존했다.
3. 총괄 독립 추가 반례 3유형: 연6%·12개월에 다른 표 셀의80억원 사용, 통신 결측을 전력0원으로 대체, ‘승인 없지만 공급 보장’의 뒤 절 누락. finance.cells 관계·최장 이름·절별 부정 범위로 수정했고 총괄이 같은 26조건을 26/26으로 재실행했다.
4. 마지막 날짜/주소 분리 회귀 중 일반 ‘~로’ 접속사 뒤 용량까지 주소로 제외하는 결함을 A08 고정 기대값이 잡았다. 주소 명시 문맥으로 좁혀 수정했고 A01~A18을 포함한 최종 전체 검사를 다시 통과했다.
5. root의 `work/client-prep/ai-independent-cases.json` 원본은 수정하지 않았다. 제품 test fixture는 같은 바이트 사본이며 SHA 일치는 최종 manifest에 포함한다.

## 4. 최종 검증과 증거

최종 `work/evidence/04B-check-results.json` 및 `04B-final-*.log`:

- typecheck 0, lint 0, **Vitest 35파일 / 467검사 통과**, data validation 0, build 0, diff check 0.
- lint에는 기존 `useNearbySites.ts:14`의 useMemo `site` dependency 경고 1개가 남는다. 04A의 의도된 선택 수명을 바꾸지 않기 위해 이 범위에서 제거하지 않았다. 이번 추가 코드의 lint 경고는 정리했다.
- AI 관련 7파일의 마지막 확장 기준 87검사: 전송·문맥·구조·프롬프트·대표 대조·MemoPanel 실제 React DOM·외부 URL 실제 React DOM을 포함한다. root의 A18은 raw script 문자열 DOM escape 검사로 검증했다.
- transport는 fake timer deadline와 비협조적 fetch/body, abort, UTF-8/크기/빈값/ERROR/fallback을 검사했다. 총괄이 별도 실제시계 65,002ms header stall 및 transport10조건 통과를 전달했다. root 증거 파일은 직접 변경하지 않았다.
- 실제 Codex in-app browser에서 `http://127.0.0.1:5204/__04b`의 **개발용 합성 fixture**로 실제 MemoPanel·ChecklistReport·PrintPortal 코드를 실행했다. 기본 off, 명시 선택, 변경·되돌림, 중단, 악성 출력, 오류·재시도, 동일 근거 재조회, 페이지 이탈·재진입 11상태를 관찰했다.
- `04B-browser-checks.json`, `04B-browser-requests.jsonl`, `04B-browser-eligible.png`, `04B-browser-invalidated.png`. 두 PNG는 읽을 수 있는 실제 UI를 육안 확인했다. invalidated 그림은 개발 HMR 이후 무효화 상태이며 오류 화면이라고 부르지 않는다.
- 브라우저의 악성 source는 img가 생성되지 않고 글자로 보였으며 unsafe href 0개, 정상 링크 opener 분리, script 원문 글자 표시 및 AI 부록 제외를 확인했다. 기본 report DOM에 15,000㎡·5,000㎡·60억원이 존재했다.
- 검증용 서버·탭은 종료했다. 5199 기존 서버나 총괄 탭은 수정/종료하지 않았다. 브라우저 검증 이후의 최종 주소/날짜 인식 및 반복 헤더 설명 정리는 관련 회귀·전체 검사로 다시 확인했다.

## 5. 다음 묶음 계약

### 05 경로·세션

- MemoPanel은 `/review`를 떠나면 unmount해야 한다. unmount에서 진행 요청을 취소하고 PrintPortal을 제거한다. 재진입은 입력/후보만 복원하고 AI 원문·prompt·적격/체크 상태를 저장하지 않는다.
- `selectionRevision`과 `requestRevision` 문자열 전달을 유지한다. 현재 App의 request 문자열은 lookup의 queryKey/selectionRevision/requestRevision/status를 포함한다. 동일 key 재시도나 loading/error/partial을 done으로 축약하지 않는다.
- `memoContext.ts`의 full v4 서명은 변경하지 않았다. 입력 세션 복원 시 과거 온라인 근거·AI를 현행으로 복원하면 안 된다.

### 06 결과·비교·A4

- `ReportProps.memoEligible`과 `includeAiAppendix`의 기본 false 및 MemoPanel의 적격 판단을 유지한다. `complete`만 보고 AI를 허용하거나 중단/오류를 done으로 바꾸지 않는다.
- AI는 근거 표와 분리된 `<section className="report-ai">`다. A4 쪽 나누기·머리말·첫 장 구성·전 페이지 실제 PDF 검수는 06/08에서 수행해야 한다. 여기서는 print DOM 경계만 완료했다.
- 원문 대조와 검사의 한계 문구를 유지한다. 총평/행동/한계 숫자는 보수적으로 부록을 막으므로 정상 문장이 추가로 보류될 수 있다. 이 범위를 확대하려면 관계별 독립 기대값과 검사를 먼저 추가한다.
- 새 외부 출처 소비부도 SafeExternalLink를 사용한다. 문자열을 HTML로 렌더하지 않는다.

### 08/09 통합·배포

- 현재 5199의 `/api`는 구형 운영 프록시다. 새 strict 서버/클라이언트 연결 성공과 이 합성 결과를 혼동하지 않는다.
- 새 배포 후 실제 무료 AI 정상 응답 또는 제한·빈 응답·실패 복구를 확인한다. provider 가용성·실제 응답 품질·운영 연결은 이 패키지에서 확인하지 않았다.
- 기본/선택 AI 부록의 A4 전체 페이지, 세 viewport, 최종 router에서의 이탈/복원, 접근성·성능·배포 검증은 후속 범위다.

## 6. 소유권 반환

제품 변경 18파일과 이 인계서 1파일을 `work/evidence/04B-changed-files.sha256.json`에 기록한다. 검증 로그·fixture 서버·크기 측정·실행 기록은 모두 작업 루트 `work/`에 있으며 사용자 deliverable이나 배포 산출물로 표시하지 않는다. root 소유 STATE/DECISIONS/EVIDENCE/AGENT_LOG/독립 probe/기대값은 수정하지 않았다. 총괄의 검수·커밋 뒤 다음 실행자에게 넘길 수 있다.
