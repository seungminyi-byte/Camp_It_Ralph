# CLAUDE.md — The Grand Site DC (해커톤 프로토타입)

## 프로젝트

데이터센터 후보 부지의 전력 수전 가능성·인허가 지연 리스크를 점수화하고 지연을 금융비용으로 환산하는 지도 웹앱.
GS그룹 해커톤 PLAI CAMP S3 **개발자리그(9.21~22, 현장 1박2일 AI 에이전트 빌드)** 출품.
전체 계획·일정·스코어링 설계는 `docs/PLAN.md`, 데이터 출처·제약·정정사항은 `docs/DATA.md`, 실행 절차는 `README.md`.

## 세션 시작 시 할 일

1. `README.md`의 "직접 발급이 필요한 키" 표를 확인하고, 아직 발급되지 않은 키가 작업에 필요하면
   **사용자에게 발급 URL과 절차를 다시 안내**한다. 계정 가입·로그인·키 발급은 대행하지 않는다.
   최소 필요: Gemini 무료 키(https://aistudio.google.com/apikey) — 실사 메모 기능 실기용.
2. `README.md` "현재 상태와 다음 단계"에서 이어서 할 항목을 고른다.
3. 데이터 재생성이 필요할 때만 `fetch_raw.py` → `build_all.py`. 평소에는 커밋된 `prototype/public/data`로 충분.

## 규칙

- 대화·문서는 한국어, 코드 식별자·주석은 영어, 커밋 메시지는 한국어.
- TypeScript strict, 2-space indent, 함수형 컴포넌트 + Hooks. 상태관리·라우터·차트 라이브러리 추가 금지.
- 스코어링 로직은 `prototype/src/scoring/engine.ts`에만 두고 UI와 분리 유지. 가중치·임계값·통계는
  `data-pack/curated/constants.json` 한 곳에서만 바꾼다(앱 복사본은 `build_all.py`가 동기화).
- 엔진을 바꾸면 `engine.test.ts` 골든 테스트를 먼저 갱신하고 통과시킨다.
- 런타임 외부 API 의존을 늘리지 않는다(지도 타일·LLM 호출만 온라인). 새 데이터는 빌드타임 JSON으로 번들.
- API 키를 코드·번들·커밋에 넣지 않는다. 서버 키는 Vercel 환경변수, 브라우저 키는 localStorage.
- 화면 문구에 "스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가" disclaimer를 유지한다.

## 명령 (Windows, 경로에 `&`가 있으면 npx 대신 node 직접 실행)

```bash
cd prototype && npm install
node node_modules/vite/bin/vite.js --port 5199        # dev 서버 (Claude Code는 .claude/launch.json의 dc-screener)
node node_modules/typescript/bin/tsc -b                # 타입 검사
node node_modules/vitest/vitest.mjs run                # 골든 테스트
node node_modules/vite/bin/vite.js build               # 프로덕션 빌드
python data-pack/scripts/validate_out.py               # 데이터 검증
python data-pack/scripts/build_all.py                  # 전처리 전체 + 검증 + 앱 데이터 동기화
```

Python은 3.12+ 에 `pyshp`, `pyproj` 필요. 공공 CSV 인코딩은 cp949 우선, 실패 시 utf-8-sig (상가업소 CSV는 UTF-8).

## 데이터 사실관계 (문서·발표에 그대로 인용)

- 전력 1차 기술검토 736건(**2024.8.1~2026.3.27**), 수도권 71%·본심사 탈락률 58.3%·서울 통과 1건,
  수도권 최종 승인률 1.9%(CBRE 2026.7), 비수도권 통과율 89.7%. 출처는 `constants.json`의 `stats`.
- 안양 갈등 사례는 **호계동**(효성 에버쇼, 무산). 관양동 아님.
- 한전 공개 여유용량은 발전접속 기준 → 수전 판단에 직접 사용 금지. 변전소 공식 좌표 비공개 → OSM 참고치.
- 자사 사례: 마그나PFV(GS건설 대주주) 고양 덕이동 DC 착공신고 반려 — 데모 시나리오 1.
- 네이버 검색 API는 NAVER API HUB(`naverapihub.apigw.ntruss.com/search/v1/news`, `X-NCP-APIGW-*` 헤더)로 이관됐다.
  `developers.naver.com`·`X-Naver-Client-*` 조합은 신규 키에서 401. 뉴스 갈등 기사(24개월): 고양 50 · 세종 26 ·
  과천 24 · 금천 18 · 김포 12건. **세종 어진동 DC는 2026.3 주민 반발로 백지화** — 비수도권도 무갈등이 아니다.
- 데모 3지점 현재 등급(회귀 감시용): 고양 덕이동 D 45 / 인천 청천동 E 32 / 세종 반곡동 B 75.

## 남은 작업 (우선순위순)

1. Gemini 키로 메모 생성 실기 → `prototype/public/data/precomputed_memos.json` (시나리오 id → 메모 텍스트) 생성
2. ~~Vercel 배포 + 환경변수~~ 완료 (URL·재배포 절차는 README)
3. `docs/DEMO.md` 데모 대본(시나리오 1→2→3, 오프라인 절차)
4. `ralphathon/` 현장 재빌드 팩: SPEC.md(스키마·수식 전문), TASKS.md(태스크별 완료 정의·검증 커맨드),
   prompts/(00~90 단계), fixtures/(골든 입출력) → 빈 폴더에서 프롬프트만으로 재빌드 드라이런 1회
5. ~~선택 확장(P1)~~ 완료: VWorld 용도지역 오버레이 · 건축HUB 허가→착공 통계 · 네이버 뉴스 갈등 시그널

## 저장소·계정

- 원격: https://github.com/seungminyi-byte/Camp_It_Ralph (비공개 팀 저장소). 팀원별 프로토타입을 각자 브랜치에 둔다
  (`nanace1228-prototype` = 팀원 Next.js 프로토타입, **`seungminyi-byte-prototype` = 이 프로젝트**). 두 브랜치는 히스토리가 독립이다.
  최종 출품작 선정 후 병합·정리는 팀 합의로 진행한다.
- 이 PC의 gh에는 계정 2개가 있다. 회사 계정 `smy_gsenc`는 엔터프라이즈 관리 계정이라 개인 저장소 생성 불가,
  조직 `gs-enc-playground`는 SAML SSO 승인이 필요하다. 푸시 전 `gh auth status`로 활성 계정이 `seungminyi-byte`인지 확인
  (`gh auth switch --user seungminyi-byte`). 조직으로 옮기려면 사용자가 SSO 승인 후 `gh repo transfer` 또는 새 원격에 푸시.
- 푸시는 사용자가 요청할 때만 한다.
