# 배포·공개 제출 계획

## 확인된 접근 상태 (2026-09-21)

- GitHub CLI 2.101.0 공식 Windows archive SHA256: `bc6c814367b193cd8e713611d61e36013c0ef843b8f516458fe3eda039192794`, 공식 checksums.txt와 일치 후 실행.
- 첫 checksum 비교는 PowerShell 응답 본문 처리 문제로 실패했고 실행하지 않았다. 이후 일시 DNS/timeout을 거쳐 curl로 공식 checksum 파일을 내려받아 파일 내용으로 비교 성공. 검증되지 않은 archive를 실행하지 않음.
- Git Credential Manager의 기존 GitHub 인증을 메모리 안에서만 gh에 전달. 키를 출력·파일 저장·새 발급하지 않음. 개인 설정/global PATH 변경 없음.
- `gh api repos/seungminyi-byte/Camp_It_Ralph`의 제한된 metadata 조회: default_branch prototype, private true, push true, admin false, maintain false. 저장소 공개 여부는 사용자 목표와 구분해야 한다.
- Git 기본 작성자 설정은 없음. 별도 설정 변경 대신 해당 커밋에만 `Codex Agent <codex-agent@local.invalid>`를 지정해 작성. 사용자·팀원 명의를 임의 사용하지 않음.
- 초기 기록 커밋: `1eb67c4`. 아직 push/PR/새 배포 없음.

## 17:02 KST 진행

- 구현 단계1 커밋 `389f0cdc2f9e00f6ee363aa67c2c7158759ddcec`를 작업 브랜치에 push. 원격 prototype를 fetch하여 기준 66e310b 유지 확인.
- 초안 PR https://github.com/seungminyi-byte/Camp_It_Ralph/pull/6 생성 후 API로 OPEN/isDraft true/base prototype/head389f0cd/MERGEABLE 확인. 아직 merge/production 배포하지 않음.
- 자동 Vercel Git preview status 실패: “GitHub couldn’t verify an account for the commit.” (commit status API). 로컬 검사 실패와 구분한다. 저장소의 기존 Actions 배포는 이런 author/team 제약을 피하도록 CLI 경로로 구성되어 있다. 다른 사람 명의로 commit을 바꾸거나 새 권한을 요청하지 않고, 구현·필수 검증 완료 후 기존 Actions 배포 경로로 Ready를 확인한다. preview 실패를 배포 성공으로 표시하지 않는다.
- PR 설명은 현재 완료된 단계만 기술한 초안. 최종 구현 범위가 확정되면 제목·본문을 다시 작성한다.

## 완료 전 수행

1. 구현·검증이 끝난 작업 브랜치를 기존 원본 저장소에 push하고 prototype 대상으로 PR. 팀원 신규 변경이 있으면 fetch 후 비파괴적으로 통합·관련 검사.
2. 기존 배포 workflow/프로젝트를 사용해 배포. commit/Actions/Vercel Ready/production asset/API를 각각 확인.
3. 원본 저장소는 비공개이므로 최종 제출용 공개 저장소가 별도로 필요. 원본 이력과 공개 범위를 분리하고, 비밀정보·사내자료·raw session log가 없는 검증된 작업 스냅샷만 공개 사본 후보로 준비한다. 새 결제·권한확대가 필요하면 최종 검토 가능한 상태를 먼저 만든 뒤 승인을 요청한다. 현재는 생성/공개 전.
4. 공개 데모·공개 영상·공개 코드 사본을 비로그인 상태에서 확인. private 원본 URL을 공개 GitHub 제출 링크로 사용하지 않는다.
5. 대회 최종 제출은 자료·링크·실측 결과가 준비된 뒤 사용자 별도 승인.

## 로컬 실행 핸들

- Vite dev: exec session 87567, http://127.0.0.1:5199/ (2026-09-21 16:42 KST 시작). 이후 실제 핸들과 HTTP 응답을 다시 확인해야 하며 이 기록만으로 살아 있다고 가정하지 않는다.
- 공개 URL: https://grand-site-dc.vercel.app (현재는 기존 배포). 로컬 API 프록시는 기존 운영을 호출하므로 로컬 API 코드 수정의 검증을 대신하지 않는다.
