# 제품·디자인·행사 조사

확인일: 2026-09-21. Tavily 도구가 노출되지 않아 tavily-web-research 스킬의 대체 규칙에 따라 web.run 및 실제 브라우저에서 1차 출처를 열람했다.

## 제품 참조와 채택

| 출처 | 관찰한 패턴 | 우리 서비스의 적용 / 제외 | 이용 범위 |
|---|---|---|---|
| [Paces](https://www.paces.com/) | 전력·환경·인허가 제약의 조기 확인과 검토 보고서 | 주소→제약·미확인→다음 조사 흐름. 해외 서비스의 속도/절감 수치와 공급 보장 표현은 옮기지 않음 | 제품 원칙 참고, 코드·문구·이미지 재사용 없음. 사이트 All Rights Reserved |
| [Felt](https://felt.com/product) | 지도와 자료표 연결, 인쇄·발표용 내보내기 | 위치 선택→같은 후보의 근거를 패널에서 확인, 결과 보고서. 로그인·협업·클라우드 데이터 연결은 범위 제외 | 제품 원칙 참고, 자산 재사용 없음. 사이트 All Rights Reserved |
| [Leaflet](https://github.com/Leaflet/Leaflet), [LICENSE](https://github.com/Leaflet/Leaflet/blob/main/LICENSE) | 기존 앱의 가벼운 지도·좌표 선택·레이어 표시 | 기존 1.9.4 유지, 접근성 및 지도 외 검색 경로 보완 | BSD-2-Clause. 기존 저작권·라이선스와 지도 attribution 유지. 타일 이용조건은 별도 |
| [kepler.gl](https://github.com/keplergl/kepler.gl), [LICENSE](https://github.com/keplergl/kepler.gl/blob/master/LICENSE) | 위치자료 탐색과 레이어/표를 연결하는 공개 프로젝트 | 정보구조만 참고. 기존 Leaflet 대체·WebGL/상태관리 의존성 추가하지 않음 | MIT. 코드/데이터 편입 없음 |

## getdesign.md 후보 3개 — 총괄의 비교 초안

사이트 분석 페이지와 실제 preview를 열어 비교했다. 공개 패턴의 독립 분석이며 각 브랜드의 공식 디자인 배포물은 아니다. 유료 키트 구매나 설치는 하지 않았다. 자체 CSS/컴포넌트로 구현하며 다른 서비스 로고/폰트/자산을 복제하지 않는다.

| 후보 | 확인 출처 | 적합한 점 | 반론/위험 | 총괄 잠정 판단 |
|---|---|---|---|---|
| Airtable | [분석](https://getdesign.md/airtable/design-md), [preview](https://getdesign.md/design-md/airtable/preview) | 구조화된 자료와 표, 항목별 상태 구분 | 다색 장식이 제약/미확인 의미색과 경쟁할 수 있음 | 자료표의 정렬 원칙만 참고 |
| Cal.com | [분석](https://getdesign.md/cal/design-md), [preview](https://getdesign.md/design-md/cal/preview) | 중립 배경·여백·명료한 주요 행동, 시작 화면 가독성 | 넓은 카드만 반복하면 검토 정보가 느슨해짐 | 메인·기본 사용 흐름의 유력안 |
| IBM | [분석](https://getdesign.md/ibm/design-md), [preview](https://getdesign.md/design-md/ibm/preview) | 기업 업무에 맞는 정보 위계·표·일관된 상태 | 대형 얇은 영문 타이포를 한글에 그대로 적용하면 가독성 손실 | 근거·비교·보고서 밀도에 참고 |

후속 디자인 에이전트가 대안·반론과 적용 범위를 검토한 뒤 총괄이 최종 확정한다. 기존 오렌지 #d65f14를 브랜드 기준으로 보존하되 텍스트·버튼 대비는 실측해 더 진한 보조색을 적용할 수 있다. 확인은 녹색으로 사업 적합을 뜻하지 않게 상태 문구를 함께 쓴다.

## 행사 지침

- [참가자 가이드](https://52g-hackathon.ralphthon.org/guide), [심사 기준](https://52g-hackathon.ralphthon.org/criteria)를 로그인된 기존 브라우저의 새 조사 탭에서 직접 열람했다.
- 제출은 문제/아이디어, 실제 goal 원문, 주요 JSONL 1개(추가 ZIP 선택), 최종 설명·공개 링크 3개·최대 5p 발표자료. 최종 마감 2026-09-22 12:00 KST. 팀 대표만 저장/제출 가능.
- 실제 업무정보 대신 공개·합성 시연자료 사용. 로그는 비밀정보 점검 후 행사 비공개 업로드로만 제출하며 공개 링크에는 올리지 않음.
- 심사 기준은 실행 기록 20, goal 기본 구성 20, 결과 중심 위임 30, 완료/검증 설계 30. 추가 지시 횟수 자체 감점 없음.
- 결선 발표 5분·질의응답 3분. 화려한 자료 자체보다 실제 결과·검증 근거에 집중.

## 환경 근거

- 설치된 react-leaflet 5.0.0 및 @react-leaflet/core의 package.json/실제 LICENSE.md는 **Hippocratic-2.1**이다. Leaflet의 BSD나 React의 MIT로 일괄 표기하지 않는다. 기존 라이브러리를 계승하며 원문 notice를 배포 파일 `prototype/public/THIRD-PARTY-NOTICES.txt`에 포함한다. 프로젝트 전체의 신규 라이선스를 임의 지정하지 않는다. 공개 데이터별 출처/이용조건은 DATA.md를 유지한다.

- Node 공식 https://nodejs.org/dist/index.json 에서 24 LTS를 선택. v24.21.0 Windows x64 archive SHA256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`, 공식 SHASUMS256.txt 대조 일치. work/tools에만 설치, 시스템 설정 변경 없음.
