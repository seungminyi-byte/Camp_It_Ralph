# ARIA 인근 시설·단계별 검토 통합

## 범위

2026-09-08 기본 브랜치 `2ab3ef6`에 ARIA `11a8e86`을 이력 보존 병합했다. Git 충돌은 없었다. 별도 작업 트리를 사용하며 원래 작업 트리의 README 수정과 미추적 AGENTS.md는 포함하지 않는다.

- 초기 요약은 엔진의 `review.overview`, 전체 확인사항·보고서는 기존 `review.issues/actions`를 사용한다. 완전히 미입력한 상세조건만 초기 요약에서 생략하고 입력을 시작한 오류·누락과 확인된 제한은 표시한다.
- 면적 입력 여부와 충족률은 엔진의 `area.hasInputs/fitPct`에서 계산한다. 활성 입력방식만 반영하고 계산 불가는 null이다. 점수 명칭은 참고점수다.
- 데이터센터 목록 오류는 전체 앱 로드를 실패시키지 않는다. 파일 누락·비정상 JSON·스키마 오류는 자료 미확인으로 안내한다. 정상 빈 배열도 인근 시설 없음으로 해석하지 않는다.

## 지도 자료 검증

ARIA 후보 7곳 중 **2곳**을 수록한다. 회사명·운영사·고유 시설명은 지역·시설 유형으로 바꾸고 출처 URL은 유지했다. 전국 전수 목록이 아니며 운영 상태·가용 상면·전력은 실시간 미확인이다. 시설 존재와 규모는 참고점수·공급 가능량 계산에 쓰지 않는다.

| 수록 항목 | 운영·규모 근거 | 주소·좌표 검증 | MW |
|---|---|---|---|
| 세종 집현동 대규모 데이터센터 | [공식 소개](https://datacenter.navercorp.com/gaksejong/): 운영 소개, 서버 수용 규모 60만 유닛 | 같은 페이지 행복대로 824, VWorld 응답 36.50815688750704 / 127.34100594521068 | 종전 270MW는 해당 출처에서 확인되지 않아 용량·종류 null. 개장연도도 미수록 |
| 안산 사동 대규모 데이터센터 | [2024-06-12 발표](https://www.kakaocorp.com/page/detail/11097): 2024년 1월 가동, 설계 수용 규모 4,000랙·12만 서버, 연면적 47,378㎡. [2025-12-29 발표](https://www.kakaocorp.com/page/detail/11861)도 확인 | [입주 연구기관 안내](https://aic.hanyang.ac.kr/notice/notice.php?code=notice&idx=1024&page=9&ptype=view)의 해안로 689, VWorld 응답 37.293497971991656 / 126.83172113353041 | 용량·종류 null. 설계 수용 규모는 현재 가용 규모가 아님 |

좌표는 기존 운영 `/api/geocode`에서 2026-09-08 재확인한 주소 대표점이다. 필지 경계·건물 출입구 위치가 아니다. 새 런타임 API·키는 추가하지 않았다. 서버 유닛은 서버 대수·MW로 환산하지 않는다.

### 이용조건과 제외 내역

공개 시설 소개·보도자료의 최소 사실관계만 자체 문장으로 정리하고 근거 링크를 제공한다. 원문·사진·도면·로고는 번들에 수록하지 않았다. 원자료는 개방 데이터 라이선스를 부여한 자료가 아니며 원문 재배포 권한을 취득했다고 주장하지 않는다. 이번 수록 범위는 사실의 자체 요약이며 원문·브랜드 자료의 재사용 범위를 확장하지 않는다.

- 강남 소규모 시설: [원출처](https://www.digitaledgedc.com/products-services/data-centers/south-korea/) 전력 값이 본문·표에서 다르고 IT/시설 구분도 불명확했다. [약관](https://www.digitaledgedc.com/resources/document/terms-of-use/) 4·6항의 데이터 배포·제3자 재배포 제한으로 제외했다.
- 마포 상면 임대 시설·고양 대규모 시설: [마포 원출처](https://www.equinix.com/data-centers/asia-pacific-colocation/korea-colocation/seoul-data-center/sl1), [고양 원출처](https://www.equinix.com/kr/ko/resources/data-sheets/seoul-sl2x-tech-specs)의 사실 확인과 별개로 [약관](https://www.equinix.com/about/legal/terms) 3항의 데이터 복제·배포 제한으로 제외했다.
- 마포 월드컵북로60길 12 시설: [원출처](https://www.digitalrealty.com/ko/data-centers/asia-pacific/seoul/icn10)의 주소·규모는 확인했으나 종전 12MW·IT 구분은 해당 페이지에 없었다. [한국어 약관](https://www.digitalrealty.com/ko/about/legal/terms)에서 재사용 조건 본문을 확인하지 못해 제외했다.
- 춘천 시설: [종전 보고서](https://www.navercorp.com/static/NAVER_2022_ESG_KOR.pdf)는 404. [현재 소개](https://datacenter.navercorp.com/gaksejong/)의 주소(순환대로 1231)가 기존 목록과 다르고 새 주소의 VWorld 조회도 404여서 기존 좌표를 재사용하지 않았다. [2023년 발표](https://navercorp.com/media/pressReleasesDetail?seq=31060)의 10만 유닛은 10만 서버 대수와 구분한다.

## 검증·배포 기록

- 타입 검사(src/API/scripts)·lint·Vitest **18개 파일 156개 테스트**·`validate_out.py`·프로덕션 빌드 통과. 의도한 초기/전체 검토 분리 기대값을 먼저 작성해 실패를 확인한 뒤 구현했다.
- 면적 30,000㎡·용적률 200%·건폐율 50%·4층 → 최소 대지 15,000㎡, 대지 10,000㎡ → 부족 5,000㎡·충족률 67%. 평균 차입잔액 1,000억원·연 6%·12개월 → 60억원. 결측·명시적 0·잘못된 입력·법정 제한 E 상한·재해 15점 1회·해상/자료 범위 밖·비교·의견 유효성 테스트 통과.
- `--sync-only`만 실행하고 전체 자료를 재수집하지 않았다. curated/public JSON 일치, 운영사 필드 제거 확인.
- 프리뷰 `dpl_AdWiDrG7kRSRcfNKF9TvpsrK71a7`에서 규제(고양 공원), 재해(군산 지정지구), 용도지역(세종 제2종일반주거지역) JSON HTTP 200과 각 API 잘못된 좌표 HTTP 400 확인. 일반 HTTP 접근의 인증 HTML은 API 성공으로 세지 않고, 인증된 `vercel curl` 응답을 확인했다. 서버 코드는 기존과 동일하다.
- 브라우저: 초기 요약은 미입력 상세조건을 숨기고 보고서는 비용·차입잔액·전력/용수/통신 미확인과 전체 추가 확인사항을 유지. 면적 변경 30,000→40,000㎡ 및 AIDC 유형 변경 후 저장 후보가 부족 5,000→10,000㎡로 재계산됨. AI 생성 중 입력 변경 시 요청/의견 해제 안내와 현재 조건의 기본 보고서 갱신 확인.
- 격리된 로컬 정적 빌드 서버에서 목록 404 및 `sites:[null]` 응답을 주입해 앱 로드·자료 미확인 표시·부지 분석 유지 확인. 정상/빈 배열·HTTP 오류·JSON 오류·네트워크 실패는 단위 테스트도 통과.
- A4는 프리뷰의 실제 출력 DOM과 빌드된 인쇄 CSS를 210×297mm, 여백 13mm로 펼쳐 시각 확인했다. 첫 장 내용 높이 985px < 사용 가능 1,024px, 내용 폭 695px. 기본 보고서·면적/금융 표·미확인 기록 유지. 브라우저 PDF 버튼의 호출과 제목 변경을 확인했으나 앱 내 브라우저에서 운영체제 인쇄 대화상자와 실제 PDF 파일 저장까지는 확인하지 못했다.
- 최종 프리뷰(모바일 팝업 글자·높이 보완 포함): `dpl_HLvTzSZGLNCar5Bx52tEHfjZWbeD`, https://grand-site-qk8bzdx5m-camp-it-ralph.vercel.app, Ready.
- 직전 정상 운영 배포(복구 기준): `dpl_Hjwvu2ZMUoPs7wbgRsELBsPud4Ub`. 운영 배포 결과는 아래에 이어 기록한다.

- 최종 프리뷰 데스크톱 1280px·모바일 390×844px에서 시설 팝업과 출처 링크 확인. 모바일 팝업 내부 스크롤로 출처까지 접근 가능하며 문서 가로 넘침 없음.
