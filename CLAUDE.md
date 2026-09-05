# CLAUDE.md — 여기 DC 돼요? (가칭, 내부 코드명 The Grand Site DC · 해커톤 프로토타입)

## 프로젝트

데이터센터 후보 부지의 전력 수전 가능성·인허가 지연 리스크를 점수화하고 지연을 금융비용으로 환산하는 지도 웹앱.
화면 서비스명은 **"여기 DC 돼요?"(가칭)** — Vercel 프로젝트명 `grand-site-dc`·`X-Title` 헤더는 배포가 걸려 있어 그대로 둔다.
GS그룹 해커톤 PLAI CAMP S3 **개발자리그(9.21~22, 현장 1박2일 AI 에이전트 빌드)** 출품.
전체 계획·일정·스코어링 설계는 `docs/PLAN.md`, 데이터 출처·제약·정정사항은 `docs/DATA.md`, 실행 절차는 `README.md`.

## 세션 시작 시 할 일

1. `README.md`의 "직접 발급이 필요한 키" 표를 확인하고, 아직 발급되지 않은 키가 작업에 필요하면
   **사용자에게 발급 URL과 절차를 다시 안내**한다. 계정 가입·로그인·키 발급은 대행하지 않는다.
   현재 필요한 키는 전부 Vercel 환경변수에 있다(`OPENROUTER_API_KEY`·`LLM_MODEL`·`VWORLD_API_KEY`).
2. `README.md` "현재 상태와 다음 단계"에서 이어서 할 항목을 고른다.
3. 데이터 재생성이 필요할 때만 `fetch_raw.py` → `build_all.py`. 평소에는 커밋된 `prototype/public/data`로 충분.

## 규칙

- 대화·문서는 한국어, 코드 식별자·주석은 영어, 커밋 메시지는 한국어.
- TypeScript strict, 2-space indent, 함수형 컴포넌트 + Hooks. 상태관리·라우터·차트 라이브러리 추가 금지.
- 스코어링 로직은 `prototype/src/scoring/engine.ts`에만 두고 UI와 분리 유지. 비교 트레이도 예외가 아니다 —
  칩의 등급·비용은 `scoreSite()` 재호출 결과만 표시하고, 차액은 그 결과값끼리의 뺄셈만 한다(`src/compare/pins.ts`). 가중치·임계값·통계는
  `data-pack/curated/constants.json` 한 곳에서만 바꾼다(앱 복사본은 `build_all.py`가 동기화).
- 엔진을 바꾸면 `engine.test.ts` 골든 테스트를 먼저 갱신하고 통과시킨다.
- 런타임 외부 API 의존을 늘리지 않는다(지도 타일·LLM·**VWorld 점 조회 두 라우트**(`api/zoning.ts` 용도지역, `api/restrictions.ts` 규제구역)만 온라인 —
  규제구역은 배포본이 로그인·공공누리 4유형이라 번들이 불가해 2026-09-05 사용자 확정으로 예외). 그 밖의 새 데이터는 빌드타임 JSON으로 번들.
- API 키를 코드·번들·커밋에 넣지 않는다. 키는 **서버(Vercel 환경변수)에만** 둔다 — 브라우저에 키를 넣는 UI는 없다.
- 화면·데이터·프롬프트·문서에 **회사명(사업자명)을 쓰지 않는다** — '자사' 같은 표현도 금지. 실사 메모 페르소나는
  가상의 '데이터센터팀'이고, 사례는 언론 보도 인용임을 전제로 지역명·시설 유형으로만 서술한다.
- **특정 사업장·시설의 고유명을 단가·규모 예시로 쓰지 않는다**(예: 총사업비 라벨에 특정 DC명 인용 금지).
  출처 URL·언론사명, 데이터 출처 기관·서비스명(한국전력공사·VWorld·건축HUB·네이버 뉴스 검색·OpenStreetMap)은 유지한다.
  **예외(사용자 확정)**: `news_signal.json`의 자동 수집 기사 제목은 링크가 달린 언론 인용이라 원문 그대로 표시한다 —
  제목 안의 회사명·의원 실명을 임의로 고치지 않는다(헤드라인 왜곡 방지).
- 화면 문구에 "스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가" disclaimer를 유지한다.
- 화면·보고서·LLM 프롬프트 문구에 영어 직역체(축·게이트·앵커·시그널·매칭·센트로이드·점추정·로드·프록시·오버레이)를 쓰지 않는다.
  현재 표기: 전력 수전 가능성 / 인허가 여건 · "공급가능 변전소 미확인으로 D등급 이하로 제한" · 참조 사례 · 대표값 ·
  뉴스 갈등 보도 · 행정구역 미확인 · 가장 가까운 읍면동 중심점 · 자료 범위 밖(북한·국외도 '남한 자료 범위 밖'이 아니라 그냥 자료 범위 밖) ·
  법정 보호·규제구역 / 법적 입지 제한 구역 / 규제구역 검토 필요 / "법정 보호·규제구역 해당으로 E등급으로 제한". 감점 라벨은 `checklist.ts`·테스트가 문자열 키로 쓰므로 함께 고친다.

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

Python은 3.12+ 에 `pyshp`, `pyproj` 필요. 이 Mac은 `/usr/bin/python3` 3.9뿐이라 스크래치 venv에 `pyshp`·`"pyproj<3.7"`을 설치해 돌린다
(p03·p08은 3.9 호환). 공공 CSV 인코딩은 cp949 우선, 실패 시 utf-8-sig (상가업소 CSV는 UTF-8). 보호지역 도형 재생성은
`fetch_raw.py protected` → `p08_protected_zones.py --probe`(유형·좌표계 확인) → `p08_protected_zones.py` → `cp data-pack/out/protected_zones.json prototype/public/data/`.

## 데이터 사실관계 (문서·발표에 그대로 인용)

- 전력 1차 기술검토 736건(**2024.8.1~2026.3.27**), 수도권 71%·본심사 탈락률 58.3%·서울 통과 1건,
  수도권 최종 승인률 1.9%(CBRE 2026.7), 비수도권 통과율 89.7%. 출처는 `constants.json`의 `stats`.
- 안양 갈등 사례는 **호계동**(민간 사업자, 무산). 관양동 아님.
- 한전 공개 여유용량은 발전접속 기준 → 수전 판단에 직접 사용 금지. 변전소 공식 좌표 비공개 → OSM 참고치.
- 고양 덕이동 사례: 민간 사업자 DC 착공신고 반려(언론 보도) — 골든 픽스처 `goyang-deogi`.
- 지형은 Mapzen Terrain Tiles(SRTM 30m·2000년 촬영 + ETOPO1 수심) 0.01° 격자. **2000년 이후 매립지
  (송도·새만금·시화)는 수역으로 읽히므로** `constants.scoring.terrain.reclaimedOverrides`와 VWorld 용도지역
  조회로 보정한다. 내륙 호수는 반대로 육지로 읽힌다.
- 네이버 검색 API는 NAVER API HUB(`naverapihub.apigw.ntruss.com/search/v1/news`, `X-NCP-APIGW-*` 헤더)로 이관됐다.
  `developers.naver.com`·`X-Naver-Client-*` 조합은 신규 키에서 401. 뉴스 갈등 기사(24개월): 고양 50 · 세종 26 ·
  과천 24 · 금천 18 · 김포 12건. **세종 어진동 DC는 2026.3 주민 반발로 백지화** — 비수도권도 무갈등이 아니다.
- 자료 범위 밖(북한·일본·먼바다·독도 같은 원거리 도서)은 `constants.scoring.coverage`로 **'판독 불가'**(`site.status='outside'`)
  처리한다 — bbox 33~38.7°/124.5~132° 밖, 휴전선(MDL)·NLL 근사 폴리라인 21점 이북, 가장 가까운 읍면동 중심점 20km 초과.
  폴리라인이 읍면동 중심점 5,471건을 하나도 자르지 않는지 `coverage.test.ts`와 `validate_out.py`가 감시한다(최소 여유 약 3km, 강화 양사면).
  서해 데모점(37.4, 126.2)은 중심점에서 16.6km라 '해상·수역' 판정이 유지된다.
- `pop_grid.json`은 SGIS 2024 1km 격자 인구 **전국 73,016셀**(합계 5,183만 명, EPSG:5179 → WGS84 중심점)이다. 2026-09-05 이전에는
  `p03_population.py`가 수도권·세종/충남·구미~영천·나주/광주 bbox로 잘라 21,944셀만 담았고 그 밖(부산·울산·제주·강원 동부 등)은
  '주거 인접' 감점이 0이었다 — 클리핑을 제거했고 `validate_out.py`·`engine.test.ts`가 부산·제주 셀 존재를 감시한다.
  격자만 다시 만들 때: `python data-pack/scripts/fetch_raw.py sgis`(zip 98MB) → `pyshp`·`pyproj` 있는 파이썬으로 `p03_population.py` →
  `cp data-pack/out/pop_grid.json prototype/public/data/`.
- 데모 3지점 현재 등급(회귀 감시용, 시나리오 좌표 기준): 고양 덕이동 D 45 / 인천 청천동 E 32 / 세종 반곡동 B 75.
  주민 갈등 가능성(`permit.conflictRisk`, 임계값 `constants.scoring.permit.conflictRisk` = mediumMin 5 / highMin 15):
  고양 높음(30) / 인천 주의(6) / 세종 낮음(4). 지연 금융비용(기본 5,000억·5.5%): 688억 / 688억 / 103억.
  **세종 4점은 mediumMin 5 경계에 붙어 있다** — 뉴스를 재수집해 세종 갈등 기사가 30건을 넘으면 '주의'로 넘어간다
  (지형 중앙값 경사 5°와 같은 성격의 경계, 골든 테스트가 감시).
  세종 반곡동은 지형 중앙값 경사 5°로 감점 밴드 경계(≤5° 0점)에 붙어 있다 — 지형 파이프라인을 바꾸면 등급이 흔들릴 수 있어
  골든 테스트가 `terrain.deduction <= 5`로 감시한다.
- **법정 보호·규제구역은 두 층**이다(2026-09-05): 번들 `protected_zones.json`(국립공원공단 공원경계 23곳 2024.12 + 한국보호지역 KDPA 1,516 도형
  **2016-12-31 기준**, Douglas–Peucker 50m·검토 유형 100m 단순화, 3.3MB)과 VWorld 실시간 점 조회(`LT_C_UD801` 개발제한구역·`LT_C_UM710` 상수원보호구역·
  `LT_C_UO301` 국가유산 보호구역(0m 입지 제한 / 500m 버퍼 역사문화환경 보존지역 검토)·`LT_C_AGRIXUE101` 농업진흥지역·`LT_C_UQ162` 도시자연공원구역).
  입지 제한 히트 → `'법적 입지 제한 구역'` 감점 40 + E 상한(`composite.capReason='restriction'`), 검토 히트 → `'규제구역 검토 필요'` 감점 15. 유형→판정·법령은
  `constants.scoring.restriction.types`, 레이어→유형은 `vworldLayers`, KDPA 원본 유형→정식 유형은 `p08_protected_zones.py`의 `TYPE_ALIASES`(데이터 배관).
  **군사시설보호구역은 공개 자료가 없어 미반영**, 개발제한구역 파일(15125048)은 공공누리 4유형(변경금지)이라 번들하지 않는다. 데모 3지점은 번들 입지 제한 도형 밖이어야
  하며(`validate_out.py`·`engine.test.ts`·`restriction.test.ts` 감시), 고양 덕이동은 개발제한구역(VWorld 런타임)에 걸릴 수 있으니 배포 후 `/api/restrictions`로 확인한다.
  북한산(37.66,126.98)·지리산·설악산은 국립공원, 팔당(37.52,127.30)은 상수원보호구역 히트가 골든 값이다. VWorld 응답이 없으면 번들 층만 판정하고 체크리스트는 '미확인'.

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
- 원격은 SSH(`git@github.com:seungminyi-byte/Camp_It_Ralph.git`)라 개인 계정 키로 푸시된다. 이 PC에 `gh`는 설치돼 있지 않다.
  회사 계정은 엔터프라이즈 관리 계정이라 개인 저장소를 만들 수 없고, 사내 조직으로 옮기려면 SSO 승인이 선행되어야 한다.
- 푸시는 사용자가 요청할 때만 한다.
