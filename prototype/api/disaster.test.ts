import { describe, expect, it } from 'vitest';

import { parseDisasterRiskHits } from './disaster.js';

describe('parseDisasterRiskHits', () => {
  it('returns no hits for a valid NOT_FOUND response', () => {
    expect(parseDisasterRiskHits({ response: { status: 'NOT_FOUND' } })).toEqual([]);
  });

  it('keeps scalar public attributes and derives the zone name', () => {
    expect(
      parseDisasterRiskHits({
        response: {
          status: 'OK',
          result: {
            featureCollection: {
              features: [
                {
                  properties: {
                    dstrct_nm: '침수위험지구',
                    grade: 2,
                    active: true,
                    nested: { ignored: true },
                  },
                },
              ],
            },
          },
        },
      }),
    ).toEqual([
      {
        name: '침수위험지구',
        attributes: { dstrct_nm: '침수위험지구', grade: 2, active: true },
      },
    ]);
  });

  it('rejects an unexpected VWorld response status', () => {
    expect(() => parseDisasterRiskHits({ response: { status: 'ERROR' } })).toThrow(
      'LT_C_UP201: status ERROR',
    );
  });
});
