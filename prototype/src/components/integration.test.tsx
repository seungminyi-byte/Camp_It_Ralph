import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadAppData, loadScenarios } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { CHECKLIST_KEYS, buildChecklist } from '../report/checklist';
import type { ScoreInput } from '../types';
import { ChecklistReport } from './ChecklistReport';
import { ResultOverview } from './ResultOverview';
import { CompareDialog } from './CompareDialog';
import { BusinessInputs } from './BusinessInputs';
import { pinId } from '../compare/pins';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';

const data = loadAppData();
const sc = loadScenarios().find((s) => s.id === 'sejong-contrast')!;
const base: ScoreInput = {
  lat: sc.lat,
  lng: sc.lng,
  landUse: sc.landUse,
  projectType: 'standard',
  capexKrw: 5000e8,
  annualRate: 0.055,
};

function renderSurfaces(input: ScoreInput) {
  const result = scoreSite(input, data);
  const site = { lat: input.lat, lng: input.lng, source: 'coords' as const };
  const rows = buildChecklist(result, data, {
    input,
    landUseSource: 'manual',
    zoningName: null,
  });
  const report = (variant: 'screen' | 'print') =>
    renderToStaticMarkup(
      <ChecklistReport
        data={data}
        input={input}
        result={result}
        rows={rows}
        site={site}
        landUseSource="manual"
        zoningName={null}
        memo={null}
        generatedBy={null}
        generatedAt={null}
        variant={variant}
      />,
    );
  const pin = {
    id: pinId({ selection: site, landUse: input.landUse }),
    selection: site,
    conditions: result.conditions,
    landUse: input.landUse,
    manualLandUse: input.landUse,
    zoning: null,
    restrictions: input.restrictions ?? null,
    disaster: input.disaster ?? null,
  };
  return {
    result,
    rows,
    overview: renderToStaticMarkup(
      <ResultOverview
        result={result}
        loading={false}
        incomplete={false}
        missingEvidence={[]}
      >
        {null}
      </ResultOverview>,
    ),
    reports: [report('screen'), report('print')],
    compare: renderToStaticMarkup(
      <CompareDialog
        open={false}
        entries={[{ pin, result }]}
        onClose={() => {}}
        onOpen={() => {}}
        onRemove={() => {}}
      />,
    ),
  };
}

describe('ARIA integration across summary surfaces', () => {
  it('omits removed scale and business-type selectors while retaining actual inputs', () => {
    const project = defaultProject(data.constants);
    const html = renderToStaticMarkup(
      <BusinessInputs
        data={data}
        project={project}
        conditions={emptyConditions()}
        hasSite
        onProject={() => {}}
        onConditions={() => {}}
      />,
    );
    for (const label of ['데이터센터 규모', '엣지', '초대형', '사업 유형', '일반 클라우드', '코로케이션', 'AI 데이터센터']) expect(html).not.toContain(label);
    expect(html).toContain('목표 수전용량');
    expect(html).toContain('대지면적');
  });
  it('hides legacy type labels in reports and comparison while preserving requested power', () => {
    const rendered = renderSurfaces({ ...base, project: { ...defaultProject(data.constants), type: 'hyperscale', businessType: 'ai', targetMw: 40 } });
    for (const html of [...rendered.reports, rendered.compare]) {
      expect(html).not.toContain('초대형');
      expect(html).not.toContain('AI 데이터센터');
      expect(html).toContain('40MW');
    }
  });
  it('does not describe missing power evidence as an ongoing lookup', () => {
    const rendered = renderSurfaces(base);
    expect(rendered.overview).toContain('필수 자료 미확인');
    expect(rendered.overview).not.toContain('공공자료 조회 중');
  });
  it('preserves the legal E cap and report evidence in the new layout', () => {
    const rendered = renderSurfaces({
      ...base,
      restrictions: {
        hits: [{ layer: 'LT_C_UD801', name: '개발제한구역', buffered: false }],
        queried: ['LT_C_UD801'],
        failed: [],
        complete: true,
      },
    });
    expect(rendered.result.composite.capReason).toBe('restriction');
    expect(rendered.overview).toContain(
      '법정 보호·규제구역 해당으로 E등급으로 제한',
    );
    expect(rendered.compare).toContain('개발제한구역');
    expect(rendered.rows).toHaveLength(CHECKLIST_KEYS.length);
    for (const html of rendered.reports) {
      expect(html).toContain('확인된 법적 입지 제한 · E등급 상한 유지');
      expect(html).not.toContain('공급가능 변전소 미확인으로');
      expect(html).not.toContain('데이터센터팀');
      expect(html).toContain('여기 DC 돼요?');
      expect(html).not.toContain('GS E');
    }
  });

  it('keeps the coverage boundary visible in the new overview', () => {
    const rendered = renderSurfaces({ ...base, lat: 38, lng: 126.5 });
    expect(rendered.overview).toContain('자료 범위 밖');
    expect(rendered.result.composite.score).toBeNull();
  });

  it('shows the base score without detailed design conditions', () => {
    const rendered = renderSurfaces({
      ...base,
      conditions: emptyConditions(),
      restrictions: {
        hits: [],
        queried: ['all'],
        failed: [],
        complete: true,
      },
      disaster: {
        found: false,
        layer: 'LT_C_UP201',
        coordinate: { lat: base.lat, lng: base.lng },
        hits: [],
      },
    });
    expect(rendered.result.composite.score).not.toBeNull();
    expect(rendered.overview).toContain('공개자료 기반 참고점수');
    expect(rendered.overview).toContain('왜 이 점수인가요?');
    expect(rendered.overview).toContain('주요 감점 요인');
    expect(rendered.overview).toContain('상세 설계 · 선택');
    expect(rendered.overview).toContain('선택 미입력');
    expect(rendered.overview).toContain('중요한 미확인 사항');
    expect(rendered.overview).toContain('면적 계산 보류');
    for (const report of rendered.reports) {
      for (const title of ['면적 계산 보류', '사업비 범위 확인', '금융비용 계산 보류', '전력 공급조건 확인']) expect(report).toContain(title);
    }
  });

  it('keeps an incomplete site unscored consistently on every surface', () => {
    const rendered = renderSurfaces(base);
    expect(rendered.result.composite.grade).toBeNull();
    for (const html of [
      rendered.overview,
      rendered.compare,
      ...rendered.reports,
    ]) {
      expect(html).toContain('추가 확인 필요');
      expect(html).toContain('미산정');
      expect(html).not.toContain('예상 인허가 지연');
      expect(html).not.toContain('주민 갈등 가능성');
    }
  });
});
