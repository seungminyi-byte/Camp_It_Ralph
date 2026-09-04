import type { AppData, LandUseSource, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { CONFLICT_LEVEL_LABEL, LAND_USE_LABEL } from '../scoring/engine';
import { VERDICT_GLYPH, VERDICT_LABEL, type ChecklistRow } from '../report/checklist';

export interface MemoContext {
  site: SiteSelection | null;
  landUseSource: LandUseSource;
  zoningName: string | null;
}

function landUseLine(input: ScoreInput, ctx: MemoContext): string {
  const label = LAND_USE_LABEL[input.landUse];
  if (ctx.landUseSource === 'auto') return `${label} (VWorld 자동 판정${ctx.zoningName ? `: ${ctx.zoningName}` : ''})`;
  if (ctx.landUseSource === 'manual') return `${label} (수동 선택)`;
  return `${label} (미확인)`;
}

/**
 * The verdicts, numbers and evidence are already settled by the engine; the model only writes the
 * opinion column. Sections are asked for as "## " headers rather than JSON because a truncated or
 * slightly malformed section still parses, which small free models make likely.
 */
export function buildMemoPrompt(
  data: AppData,
  input: ScoreInput,
  result: ScoreResult,
  rows: ChecklistRow[],
  ctx: MemoContext,
): string {
  const s = data.constants.stats;
  const loc = result.emd
    ? `${result.emd.sido} ${result.emd.sigungu} ${result.emd.emd}`
    : `좌표 (${input.lat.toFixed(4)}, ${input.lng.toFixed(4)})`;
  const cases = result.permit.matchedCases
    .map((c) => `- ${c.name} (${c.status}): ${c.summary} [출처: ${c.source_url}]`)
    .join('\n');
  const regs = result.permit.matchedRegulations
    .map((r) => `- ${r.sido} ${r.sigungu} (${r.reg_type}): ${r.detail}`)
    .join('\n');
  const checklist = rows
    .map(
      (r, i) =>
        `${i + 1}. ${r.key} · ${r.group}-${r.title} · 판정 ${VERDICT_GLYPH[r.verdict]}(${VERDICT_LABEL[r.verdict]})` +
        `${r.points ? ` −${r.points}점` : ''} · 근거: ${r.evidence}`,
    )
    .join('\n');
  const terrainLine = result.terrain
    ? `- 지형: 중앙값 경사 ${result.terrain.sample.slopeP50Deg}°, 표고 약 ${result.terrain.sample.elevM}m, ${result.terrain.band}`
    : '- 지형: 데이터 없음';
  const itemSections = rows.map((r) => `## ITEM ${r.key}\n(1~2문장)`).join('\n');

  return `당신은 데이터센터 개발을 검토하는 '데이터센터팀'(가상의 팀)의 부지 실사 담당자다. 아래 스크리닝 결과와 체크리스트를 바탕으로 체크리스트의 [검토 의견] 칸을 채운다. 판정·수치·근거는 이미 확정된 값이므로 바꾸지 말고, 각 항목이 사업에 갖는 의미와 실사 단계에서 확인할 점을 실무자 관점에서 서술한다.

[평가 대상]
- 위치: ${loc}${ctx.site?.label ? ` (${ctx.site.label})` : ''}
- 용도지역: ${landUseLine(input, ctx)}
- 부지 판정: ${result.site.label} — ${result.site.detail}
${terrainLine}
- 총사업비 가정: ${(input.capexKrw / 1e8).toLocaleString()}억원, 연 금리 ${(input.annualRate * 100).toFixed(1)}%

[스크리닝 결과]
- 종합 등급: ${result.composite.grade} (${result.composite.score}점)${result.composite.gradeCapped ? ' · 전력 게이트로 등급 상한 적용' : ''}
- 전력 축 ${result.power.score}점 · 인허가 축 ${result.permit.score}점
- 주민 갈등 가능성: ${CONFLICT_LEVEL_LABEL[result.permit.conflictRisk.level]} (갈등 사례·인근 사례·뉴스 감점 합 ${result.permit.conflictRisk.points}점)
- 예상 인허가 지연: ${result.delay.minMonths}~${result.delay.maxMonths}개월 (점추정 ${result.delay.pointMonths}개월, 앵커: ${result.delay.anchor})
- 지연 금융비용 추정: 월 ${Math.round(result.finance.monthlyCostKrw / 1e8)}억원, 총 약 ${Math.round(result.finance.delayCostKrw / 1e8)}억원

[체크리스트 — 판정과 근거 (확정값, 변경 금지)]
${checklist}

[관련 지자체 규제]
${regs || '- 확인된 특이 규제 없음'}

[유사 갈등 사례 (언론 보도)]
${cases || '- 동일·인근 시군구 사례 없음'}

[시장 통계]
- 전력 1차 기술검토 ${s.techReviewTotal.value}건 중 수도권 ${Math.round((s.capitalShare.value ?? 0) * 100)}%, 수도권 본심사 탈락률 ${((s.capitalMainReviewFailRate.value ?? 0) * 100).toFixed(1)}%, 수도권 최종 승인률 ${((s.capitalFinalApprovalRate.value ?? 0) * 100).toFixed(1)}%, 비수도권 통과율 ${((s.nonCapitalPassRate.value ?? 0) * 100).toFixed(1)}% (출처: ${s.techReviewTotal.source})
- 수도권 건축허가 데이터센터의 ${((s.capitalPermitDelayed.value ?? 0) * 100).toFixed(0)}%가 지연·차질 (국토교통부)

[출력 형식 — 아래 골격을 그대로 사용]
'## '로 시작하는 헤더 줄을 순서와 표기 그대로 모두 출력하고, 각 헤더 바로 아래에 내용을 쓴다. 헤더 외의 제목·머리말·맺음말·코드펜스·표·JSON은 쓰지 않는다. 사고 과정은 출력하지 않는다.

## OVERALL
(종합 의견 3~5문장: 등급의 의미, 가장 큰 리스크 2가지, 추진 관점의 결론)
${itemSections}
## ACTIONS
- (실사 단계 조치 3~5개, 각 1문장, 확인처가 드러나게: 예 "한국전력 지역본부에 전력공급 가능 검토 신청")
## CAVEATS
- 본 스크리닝은 참고용이며 한국전력 공식 전력공급 가능 검토와 법률 검토를 대체하지 않습니다.
- 변전소 위치는 OpenStreetMap 참고치이고 공개 여유용량은 발전접속 기준이며, 용도지역 자동 판정과 1km 격자 지형값은 토지이음·현장 측량으로 재확인이 필요합니다.
- (추가 한계가 있으면 1~2개)

[작성 규칙]
- 경어체("~입니다"). 항목별 의견은 1~2문장(120자 이내), 전체 1,200자 이내.
- 숫자·지명·사례명은 위 자료에 있는 것만 인용한다. 새 수치·기관명·법령명·사례를 만들지 않는다.
- 판정이 '—'(미확인)인 항목은 "데이터 미확보로 판단을 유보하며 ○○에서 확인 필요"로 쓴다.
- 확인된 사실은 단정하고, 추정은 "~로 추정됩니다", 검증 필요 사항은 명시한다.
- 회사명·개인 실명·내부 자료를 언급하지 않는다. 사례는 언론 보도 기반임을 전제로 서술한다.
- 특정 사업장·시설의 고유명을 비용·규모 기준으로 인용하지 않는다. 지역명과 시설 유형으로만 서술한다.`;
}
