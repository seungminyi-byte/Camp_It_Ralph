# N24 — 야간 기록 PR15와 운영 배포 계보

2026-09-22 02:38 KST 관측. [PR15](https://github.com/seungminyi-byte/Camp_It_Ralph/pull/15)에 야간 실행 기록·보고서·선별 근거23개를 포함한56문서파일을 반영했다. 제품 코드·자료·워크플로·Vercel 설정은 변경하지 않았다. 새 기능 검수나 오전 운영 성공을 뜻하지 않는다.

정확한 PR head `6c6993dce45e6ff0bcad8706c18f2f617dfdd157`의 Vercel 및 Preview Comments 성공과 mergeable/CLEAN을 확인했다. 병합 SHA는 `72752caab33a001f2e477273ba9f416ae285e3f7`이다. 기존 Vercel Git 연동의 Production6574374705가 같은 SHA로 성공했고, 배포 `dpl_HSHXkKsL38fErxvoqKAmk9nAbWXP`·[배포 URL](https://grand-site-lyugci5k0-camp-it-ralph.vercel.app)·READY와 공개 별칭의 전후 동일 대상을 확인했다. 이 문서 변경의 배포를 별도의 Actions 성공으로 기록하지 않는다.

제품 검수 기준은 PR14 `944ef3457a7c00f71890aad1499d2351ea7db681`이다. prototype, data-pack, .github/workflows, vercel.json, .vercelignore의 Git diff가 없음을 확인했다. 이전49파일789검사를 다시 실행하지 않았다. 문서 로컬 링크245개가 작업 폴더 안에서 존재하고, 선별23파일은 검수된 N12 사본과 바이트·SHA가 일치했다. 원본 보고서의 저장소 밖 로컬 링크와 Git 내부 선별 사본은 목차에서 구분한다.

N23의 낮은 우선순위 문구 보완을 반영했다. N04-release 사본에는 aliasInspected가 null이므로 그 사본만으로 당시 별칭 확인을 입증하지 않는다고 안내했다. 기존 절대경로는 과거 로컬 원본 위치로 설명하고 봉인 기록·JSON을 보존했다. 제한된 자격증명 패턴에서 일치가 없었으며 모든 형태의 비밀 부재를 보장하는 검사는 아니다.

검수 초기 잘못 옮긴 SHA는 로컬 HEAD 대조에서 외부 요청 전에 중단됐다. 올바른 전체 SHA를 Git에서 직접 읽은 뒤 한 차례 운영 계보를 확인했다. 새 API/UI/AI 요청은 하지 않았다. 마지막 실제 AI 관측은 여전히01:17 상위SSE504 실패이며,09시 이후 새 기능 관측은 N22 수락본에서 수행한다.

근거: [PR 병합](../../../overnight/N24-checkpoint/pr15-merged.json), [정확한 head 검사](../../../overnight/N24-checkpoint/pr15-checked.json), [배포 대조](../../../overnight/N24-checkpoint/checkpoint-observation-1.json), [문서 검사](../../../overnight/repository-docs-check-0236.json). 이 파일은 병합 후 작성한 후속 기록이며 PR15 자체의 포함 파일이라고 주장하지 않는다.
