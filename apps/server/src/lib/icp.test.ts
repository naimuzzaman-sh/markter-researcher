import { describe, it, expect } from 'vitest';
import { buildIcpSummary } from './icp';
import type { Icp } from '@mirrars/shared';

const fullIcp: Icp = {
  audience: 'Heads of Data',
  problem: 'manual ETL eats 10h/week',
  attributes: [
    { name: 'industry', value: 'fintech' },
    { name: 'companyStage', value: 'Series A' },
    { name: 'techStack', value: 'Snowflake' },
  ],
  geography: 'EU',
  summary:
    'Heads of Data — fintech · Series A · Snowflake · EU — manual ETL eats 10h/week',
};

describe('buildIcpSummary', () => {
  it('joins audience · attribute values · geography · truncated problem', () => {
    expect(buildIcpSummary(fullIcp)).toBe(
      'Heads of Data — fintech · Series A · Snowflake · EU — manual ETL eats 10h/week',
    );
  });

  it('skips empty parts cleanly', () => {
    expect(
      buildIcpSummary({
        audience: 'New moms',
        problem: 'no time for self-care',
        attributes: [],
      }),
    ).toBe('New moms — no time for self-care');
  });

  it('truncates long problem on a word boundary', () => {
    const long = 'a'.repeat(200);
    const out = buildIcpSummary({
      audience: 'A',
      problem: long,
      attributes: [{ name: 'k', value: 'v' }],
    });
    expect(out.endsWith('…')).toBe(true);
  });

  it('omits geography cleanly when absent', () => {
    expect(
      buildIcpSummary({
        audience: 'Solo founders',
        problem: 'no time to do customer research',
        attributes: [{ name: 'stage', value: 'pre-seed' }],
      }),
    ).toBe('Solo founders — pre-seed — no time to do customer research');
  });
});
