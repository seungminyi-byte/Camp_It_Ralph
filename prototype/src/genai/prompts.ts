import type { AppData, ScoreInput, ScoreResult } from '../types';
import type { SiteSelection } from '../App';

export function buildMemoPrompt(
  data: AppData,
  input: ScoreInput,
  result: ScoreResult,
  site: SiteSelection | null,
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
  const deductions = result.permit.deductions
    .map((d) => `- ${d.label} (−${d.points}점): ${d.evidence}`)
    .join('\n');

  return `당신은 GS건설 국내법무팀의 데이터센터 개발사업 리스크 검토 실무자다. 아래 스크리닝 결과를 바탕으로 부지 실사 메모를 작성하라.

[평가 대상]
- 위치: ${loc}${site?.label ? ` (${site.label})` : ''}
- 용도지역(가정): ${input.landUse}
- 총사업비 가정: ${(input.capexKrw / 1e8).toLocaleString()}억원, 연 금리 ${(input.annualRate * 100).toFixed(1)}%

[스크리닝 결과]
- 종합 등급: ${result.composite.grade} (${result.composite.score}점)
- 전력 축: ${result.power.score}점, 읍면동 공급가능 변전소 ${result.gate.substationCount}곳, 확보 전력 추정 "${result.power.capacityBand}"
- 인허가 축: ${result.permit.score}점
- 감점 사유:
${deductions || '- 없음'}
- 예상 인허가 지연: ${result.delay.minMonths}~${result.delay.maxMonths}개월 (점추정 ${result.delay.pointMonths}개월)
- 지연 금융비용 추정: 월 ${Math.round(result.finance.monthlyCostKrw / 1e8)}억원, 총 약 ${Math.round(result.finance.delayCostKrw / 1e8)}억원

[관련 지자체 규제]
${regs || '- 확인된 특이 규제 없음'}

[유사 갈등 사례]
${cases || '- 동일·인근 시군구 사례 없음'}

[시장 통계]
- 전력 1차 기술검토 ${s.techReviewTotal.value}건 중 수도권 ${Math.round((s.capitalShare.value ?? 0) * 100)}%, 수도권 본심사 탈락률 ${((s.capitalMainReviewFailRate.value ?? 0) * 100).toFixed(1)}%, 수도권 최종 승인률 ${((s.capitalFinalApprovalRate.value ?? 0) * 100).toFixed(1)}%, 비수도권 통과율 ${((s.nonCapitalPassRate.value ?? 0) * 100).toFixed(1)}% (출처: ${s.techReviewTotal.source}; ${s.capitalFinalApprovalRate.source})
- 수도권 건축허가 데이터센터의 ${((s.capitalPermitDelayed.value ?? 0) * 100).toFixed(0)}%가 지연·차질 (국토교통부)

[작성 지침]
- 구성: 1. 개요 및 종합 판단 / 2. 전력 수전 리스크 / 3. 인허가·민원 리스크 (감점 사유별 소명) / 4. 유사 사례 비교와 시사점 / 5. 대응 방안 / 6. 한계 고지
- 분량 800자 내외. 경어체. 과장·수식어 없이 사실과 판단을 구분해 서술.
- 확인된 사실은 단정하고, 추정은 "~로 추정됩니다", 검증 필요 사항은 명시.
- 한계 고지에 반드시 포함: 본 스크리닝은 참고용이며 한전 공식 전력공급 가능 검토와 법률 검토를 대체하지 않음. 변전소 위치는 OSM 참고치. 여유용량 공개정보는 발전접속 기준.`;
}
