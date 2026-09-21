# 09 운영 연결 실패와 Edge 요청 수정

2026-09-21 KST. 첫 운영 배포 `ecf140148bc19f2a71f6778d5473309a858f0195`는 Actions/Ready/34개 정적 파일 해시가 모두 통과했지만, 정상 입력의 geocode·zoning·restrictions·disaster·nearby-sites·wms·generate가 전부 HTTP502 `UPSTREAM_UNAVAILABLE`을 반환했다. 잘못된 좌표·빈 AI 입력은 HTTP400 `BAD_REQUEST`였다. 이 배포를 운영 연결 성공으로 수락하지 않았다. 초기 응답·배포 로그는 작업 증거의 `09-live-api-initial-red/`, `09-deployment-initial-red/`에 보존했다.

## 원인 후보와 대안

공통 외부 요청 두 곳에 추가한 `redirect: 'error'`를 원인 후보로 좁혔다. Cloudflare 공식 [workerd HTTP 구현](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c++)의 Request 생성/`tryParseRedirect`는 follow/manual만 지원한다. 이것만으로 Vercel 런타임이 같은 원인이라고 확정하지 않는다. 실제 Vercel 요청 로그는 접근 가능했지만 7개502의 내부 메시지는 비어 있어 예외 원문을 확인하지 못했다. 구형 배포 주소는 인증302여서 과거 API 본문과 직접 비교할 수 없었다. 인증 우회나 키 값 조회는 하지 않았다.

`manual` 방식은 리디렉션 응답을 그대로 받아 기존 `!res.ok` 경계로 거부하고 body를 취소한다. 자동 따라가기를 허용하지 않으며 다른 호스트에 VWorld key/OpenRouter Authorization을 보내지 않는다. 오류 원문·Location·외부 URL을 클라이언트에 반사하지 않는다.

## 좁은 변경과 검수

- `prototype/api/_vworld.ts`, `prototype/api/generate.ts`의 fetch 옵션 각 한 곳을 `error`에서 `manual`로 변경했다. URL allowlist, 키 처리, 서울 Edge 설정,12/55초 기한, byte 제한, 무료 모델 제한, 정상/부분 응답 계약은 유지했다.
- `prototype/src/test/api/edge-redirect.test.ts`는 `error`를 거부하는 런타임 반례에서 두 공급자 정상 요청을 확인하고,301/302/303/307/308을 두 경로에서 모두 한 번의 fetch만으로 거부·본문취소·no-store·Location 비노출하는12건이다. 변경 전12실패, 변경 후12통과다.
- 첫 전체 회귀에서 기존 `vworld-boundaries.test.ts`의 리디렉션 옵션 기대값이 `error`에 고정되어1건 실패했다(562통과). 자동 따라가기 금지 요구는 유지하고 기대 옵션을 `manual`로 바꿨다. 새10개3xx 회귀가 실제 거부·취소를 별도로 검증한다. 이 최초 실패도 보존했다.
- 전체 타입·린트·Vitest47파일563건·자료·빌드·비밀패턴·diff 검사7종은 최종 종료0이다. UI/인쇄 산출물34개의 바이트가 이전 검수와 같으면 세폭전체E2E와53쪽합성PDF 검수를 반복하지 않는다.
- root의 [독립 실제 HTTP 전송 검사](../evidence/checks/root-09-native-redirect.json)도 12/12건 통과했다. 현재 두 handler를 가져와 더미 키와 loopback 목적지만 사용하고, 정상200 및301/302/303/307/308을 검사했다. 실제 서버 요청은 한 번이며 리디렉션 목적지에는 도달하지 않았고, 고정502·Location 비반사를 확인했다. 이는 Vercel 런타임·실제 공급자 성공의 증거는 아니다.
- 후속 PR/새 배포 뒤 실제7API의 전후 응답으로 원인 가설과 운영 연결을 확인한다. 새로운 운영 PDF와 비로그인 흐름 검수는 여전히 필요하다.

이 문서 작성 시점은 수정 검수 단계이며 **후속 운영 배포·성공 확인 전**이다. 최종 상태와 실제 응답은 [09 운영 인계](09-reproduction-deployment.md)를 따른다.
