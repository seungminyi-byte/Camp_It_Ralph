# 선별 검증 근거

N12 전달 초안에서 총괄·독립 검수를 마친 필드만 복사한 복사 시점 기록입니다. 원본 전체 근거는 기존 로컬 작업 디렉터리에 보존합니다. [index.json](index.json)에 23개 파일의 원래 경로·바이트·해시와 선별 경계를 기록했습니다. 오전 검수·최종 완료·정리는 아직 수행하지 않아 해당 자리표시자는 넣지 않았습니다.

- [N01-review.json](N01-review.json)
- [N02-B-failed-experiment.json](N02-B-failed-experiment.json)
- [N02-B-release.json](N02-B-release.json)
- [N02-C-ai.json](N02-C-ai.json)
- [N02-C-cli-preservation.json](N02-C-cli-preservation.json)
- [N02-C-release.json](N02-C-release.json)
- [N02-C-tests.json](N02-C-tests.json)
- [N02-review.json](N02-review.json)
- [N03-collector.json](N03-collector.json)
- [N03-handler.json](N03-handler.json)
- [N04-operations.json](N04-operations.json)
- [N04-release.json](N04-release.json)
- [N07-review.json](N07-review.json)
- [N08-root-review.json](N08-root-review.json)
- [N08-tests.json](N08-tests.json)
- [N09-audit.json](N09-audit.json)
- [N09-root-review.json](N09-root-review.json)
- [N11-contract.json](N11-contract.json)
- [N11-root-review.json](N11-root-review.json)
- [N11-sources.json](N11-sources.json)
- [baseline-20260921.json](baseline-20260921.json)
- [frontend-continuity.json](frontend-continuity.json)
- [previous-goal.json](previous-goal.json)

현재 제품 검수는 49파일 789검사이고 실제 AI 생성은 01:17 시간 초과로 실패했습니다. PR13의 790검사와 4모델 실패는 이전 실험 기록이며 현재 성공 수나 현재 구성으로 합산하지 않습니다.

N23 검수에 따른 범위 보충: `N04-release.json`의 `aliasInspected`는 null이며 `missingFields`에 포함됩니다. 그 사본의 공통 note에 별칭 확인이 언급되지만, 선별 JSON 자체로 별칭 확인을 입증하지 않습니다. 완료 workflow·배포 ID/URL·READY 값까지만 이 사본에서 확인할 수 있습니다. 검수된 원본과의 바이트 일치를 유지하기 위해 JSON은 수정하지 않았습니다.
