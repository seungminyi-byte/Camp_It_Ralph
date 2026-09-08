import { describe, expect, it } from 'vitest';
import { CHECKLIST_KEYS } from '../report/checklist';
import { parseMemo, stripThinking } from './memoFormat';

const full = [
  '## OVERALL',
  '종합적으로 D 등급입니다.',
  ...CHECKLIST_KEYS.map((k) => `## ITEM ${k}\n${k} 의견입니다.`),
  '## ACTIONS',
  '- 한국전력 지역본부에 검토 신청',
  '- 토지이음에서 용도지역 확인',
  '## CAVEATS',
  '- 참고용입니다.',
].join('\n');

describe('stripThinking', () => {
  it('removes closed and still-open reasoning blocks', () => {
    expect(stripThinking('<think>음…</think>\n## OVERALL\n본문')).toBe('## OVERALL\n본문');
    expect(stripThinking('## OVERALL\n본문\n<think>아직 쓰는 중')).toBe('## OVERALL\n본문');
  });
});

describe('parseMemo', () => {
  it('parses a complete response', () => {
    const p = parseMemo(full);
    expect(p.overall).toBe('종합적으로 D 등급입니다.');
    expect(p.complete).toBe(true);
    expect(Object.keys(p.items)).toHaveLength(CHECKLIST_KEYS.length);
    expect(p.items['power.gate']).toBe('power.gate 의견입니다.');
    expect(p.actions).toHaveLength(2);
    expect(p.caveats).toEqual(['참고용입니다.']);
    expect(p.error).toBeNull();
  });

  it('preserves the overall opinion when a provider uses OVERVIEW', () => {
    const p = parseMemo(full.replace('## OVERALL', '## OVERVIEW'));
    expect(p.overall).toBe('종합적으로 D 등급입니다.');
    expect(p.complete).toBe(true);
    expect(Object.keys(p.items)).toHaveLength(CHECKLIST_KEYS.length);
  });

  it('strips code fences and leading reasoning', () => {
    const p = parseMemo(`<think>계산 중</think>\n\`\`\`markdown\n${full}\n\`\`\``);
    expect(p.complete).toBe(true);
    expect(p.overall).toBe('종합적으로 D 등급입니다.');
  });

  it('keeps what arrived when the response is cut off mid-stream', () => {
    const cut = full.slice(0, full.indexOf('## ITEM permit.regulation'));
    const p = parseMemo(cut);
    expect(p.complete).toBe(false);
    expect(p.items['power.gate']).toBeTruthy();
    expect(p.items['permit.delayStat']).toBeUndefined();
    expect(p.openSection).toContain('permit.school');
  });

  it('normalizes misspelled item keys', () => {
    const p = parseMemo('## OVERALL\n요약\n## ITEM Permit_LandUse\n용도지역 의견');
    expect(p.items['permit.landUse']).toBe('용도지역 의견');
  });

  it('falls back to JSON when the model ignores the header format', () => {
    const p = parseMemo(
      '{"overallOpinion":"요약입니다","items":{"power.gate":"게이트 의견"},"actions":["조치1"],"caveats":["한계1"]}',
    );
    expect(p.overall).toBe('요약입니다');
    expect(p.items['power.gate']).toBe('게이트 의견');
    expect(p.actions).toEqual(['조치1']);
    expect(p.complete).toBe(false);
  });

  it('surfaces an upstream error section', () => {
    const p = parseMemo('## OVERALL\n요약\n## ERROR\nrate limited');
    expect(p.error).toBe('rate limited');
  });

  it('treats unstructured text as the overall opinion', () => {
    const p = parseMemo('그냥 줄글 응답입니다.');
    expect(p.overall).toBe('그냥 줄글 응답입니다.');
    expect(p.complete).toBe(false);
  });

  it('returns an empty result for blank input', () => {
    expect(parseMemo('   ').overall).toBe('');
  });
});
