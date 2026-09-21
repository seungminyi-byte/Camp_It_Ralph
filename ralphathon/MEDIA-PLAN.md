# 영상·발표자료 준비 기록

## Higgsfield 확인

2026-09-21 plugin-management 검색으로 Higgsfield의 존재와 사용자 가용 상태를 확인했다.

- plugin ID: plugin_asdk_app_6a3293e129088191abf0875820e839da
- status: DISABLED_BY_ADMIN
- installation_policy: NOT_AVAILABLE
- installed: false

현재 계정에서 연결할 수 없는 플러그인이다. 권한 변경이나 새 결제를 시도하지 않는다. 사용자 목표에 명시된 대체 경로인 실제 배포 URL 조작 녹화 + 로컬 편집으로 완성한다. 이 확인은 녹화·편집의 완료 증거가 아니며 영상은 아직 미제작이다.

## 예정 구성 (약 3분)

1. 0:00~0:20 문제·주사용자·스크리닝 범위.
2. 0:20~1:00 공개 배포 URL에서 주소 검색→기본 검토→제약/미확인/다음 행동.
3. 1:00~1:35 선택 상세조건→면적/금융 계산의 가정과 결과.
4. 1:35~2:15 후보 추가→비교→조건 수정 시 결과 갱신.
5. 2:15~2:45 근거·출처·다음 행동 보고서와 A4 PDF.
6. 2:45~3:00 AI 선택/실패 격리, 공통 보고서 활용, 공개 링크.

최종 구현과 실제 검증에 맞춰 시나리오 수정. 합성 조건 표시, 조작·결과를 합성 영상으로 대체하지 않음. 미측정 절감 수치 금지.

## 대체 편집 환경 준비

2026-09-21 FFmpeg 공식 [다운로드 안내](https://ffmpeg.org/download.html)에서 연결한 [Gyan Windows builds](https://www.gyan.dev/ffmpeg/builds/)의 9.0.2 essentials zip을 설치했다. 홈페이지 다운로드 503 뒤 안내된 GitHub mirror의 동일 release를 사용했다. 공개 API 비인증 rate limit 뒤 기존 GitHub 인증으로 자산 metadata만 조회했다.

- [실제 release](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2), archive SHA256 `60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`; 배포자 checksum과 GitHub asset digest 및 로컬 해시 일치.
- 로컬 `work/tools/ffmpeg-9.0.2/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe`, 버전 실행 확인. 시스템 PATH/설정 변경 없음. 이 도구는 앱 runtime 의존성이 아니고 배포하지 않는다.
- [공식 gdigrab 문서](https://ffmpeg.org/ffmpeg-devices.html#gdigrab)는 단일 window title/hwnd 및 영역 녹화를 지원한다. 실제 녹화는 최종 배포 화면에서 대상 영역을 확인한 뒤 수행하고, 브라우저 조작은 지정 CUA 인스턴스만 사용한다. 다른 앱·계정 화면·사이드패널이 들어간 부분은 공개 영상에서 제외한다.
- 현재는 편집 도구 준비까지이며 실제 녹화·영상을 완료한 상태가 아니다.
