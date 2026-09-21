# 제품 진입 단계 독립 브라우저 검수

2026-09-21 총괄. 실제 browser 1 / 지정 extensionInstanceId 유지. 로컬 Vite `http://127.0.0.1:5199/`, tab 480715094. 표시 캡처와 AX/DOM 결과는 실제 주요 세션 JSONL에 보존한다. 운영 배포 및 전체 목표 검증 아님.

- 1440×900와 390×844 홈 화면 표시를 관찰했다. 최초 workspace DOM 및 print-root가 없었다. 1440에서 document scrollWidth1425, viewport1440.
- 최초 h1의 강제 초점 때문에 두 크기에서 큰 테두리가 보임을 개발 담당에게 알렸다. 수정 뒤 768×1024에서 새로고침하여 activeElement BODY, workspace 없음, scrollWidth753/viewport768 및 제목 테두리 없음 확인.
- 390 검토 진입 후 '덕이동' 입력, ArrowDown/Enter로 '경기도 고양시일산서구 덕이동 (읍면동 중심)' 선택. 공개 조회에 따른 기본 결과가 표시됨. 내부정보 및 AI를 입력/실행하지 않았다. 조회 당시 참고 C56은 이 시점 온라인 결과일 뿐 고정 회귀 기대값으로 쓰지 않는다.
- 현재지점 담기 → 후보 비교1/4 → native 비교 dialog 열림 확인. 브라우저 뒤로 홈으로 이동: openDialogs0, printRoots0, workspaceHidden true, '검토 계속하기' 표시.
- 앞으로 review 복귀: 검색값 및 후보1/4 유지, dialog 다시 열리지 않음, printRoots1, mapWidth390 및 document.scrollWidth390. 주소·후보 상태 보존 및 body portal 경계 확인.
- 첫 검색 시 개발 담당 HMR 수정과 겹쳐 workspace 로딩이 재시작했다. 해당 관찰을 기능 실패/통과로 사용하지 않고 수정 후 안정된 화면에서 위 흐름을 다시 실행했다.

남은 검증: 4곳 제한·조건/근거 변경·보고서 갱신·AI 실패/중단/완료·A4 실물·세 크기 모든 핵심 화면·axe·Lighthouse. 이 단계의 검수로 이 항목들을 통과 처리하지 않는다.
