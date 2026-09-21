# N02-C — 실패 경로 확장 복원과 실제 관측

확인 2026-09-22T01:18:37.703324+09:00. 최소09:00까지의 야간 후속 중 한 단계 수락이며 전체 완료가 아니다.

PR13의 네 모델 목록은 실제 요청에서 상위HTTP400으로 거절됐다. 구체적 원인은 확인하지 못했다. PR14는 기본 모델 목록·문서·시험 기대값만 이전 세 모델로 복원했다. 수동 사전 의견 CLI 개선과 추가 설정 경계 검사는 유지했다.

- [PR14](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/14), merge `944ef3457a7c00f71890aad1499d2351ea7db681`, 01:14:34KST.
- [Actions35624343833](https://github.com/seungminyi-byte/Camp_It_Ralph/actions/runs/35624343833) 완료·성공. 실제별칭을 조회한 `dpl_GrM1TRWGipekUuLXjMMViVcyirnr` READY와 완료workflow의 정확한배포URL을 대조했다.
- `generate.ts` 전체 SHA-256 `52e0f7edb31a19e0ecf378ac63349ea9a11bbfb6bfcf7482df21d59ea37f45a5`, PR12/e7a33e7 바이트와동일. N08소유27파일 해시도보존했다.
- 전체49파일789검사·타입·린트·빌드·diff검사 통과. PR13 당시790과다른집계이며 사라진1건은 네번째모델의parameterized기대값이다.
- 01:17:23.608KST 짧은합성1요청:11.374초, HTTP200,31bytes, 오류마커 `UPSTREAM_UNAVAILABLE`. 연결성공으로판정하지않는다.
- 같은배포/경로/도메인/시간창 canonical1이벤트: upstream_sse,HTTP200,code504,type timeout,서버10,895ms,세모델요청,텍스트전실패. 플랫폼식별자와응답헤더는정확일치하지않으므로 시간·배포상관까지만확인했다. 원본Vercel로그는저장하지않았다.

복원은 완료됐으나 **실제AI생성은복구되지않았다**. 무료네목록400은이전세목록504와다른관측이다. 계정·모델·제공자 중정확한원인과실제선택모델은미확인이다. 짧은요청이실패했으므로18항목실제UI생성은시도하지않았다. 같은실패호출을반복하지않는다.

프런트엔드·scoring·기본API코드·원본사진·이전발표/PDF는변경하지않았다. 마지막전체운영검사는PR12/e7a33e7 00:33 API6/익명16/정적34이며이번새배포의재검사로표시하지않는다. 오전최종검수는별도수행한다.

근거: [배포](../../../overnight/N02-C/release-provenance.json), [로컬회귀](../../../overnight/N02-C/root-verification.json), [안전진단](../../../overnight/N02-C/short-probe/safe-runtime-diagnostic.json), [CLI보존](../../../overnight/N02-C/postmerge-preservation.json). 공개전달본에는허용필드만선별하고프롬프트/응답본문/헤더는제외한다.
