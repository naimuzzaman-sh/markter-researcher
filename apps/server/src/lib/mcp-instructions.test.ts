import { describe, it, expect } from 'vitest';
import { MCP_INSTRUCTIONS } from './mcp-instructions';

describe('MCP_INSTRUCTIONS', () => {
  it('opens with the Mirars brand and tagline', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/Mirars/);
    expect(MCP_INSTRUCTIONS).toMatch(/research interviews on autopilot/i);
  });

  it('references the core tool categories so the agent knows the surface', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/preview_study/);
    expect(MCP_INSTRUCTIONS).toMatch(/find_candidates/);
    expect(MCP_INSTRUCTIONS).toMatch(/invite_candidate/);
    expect(MCP_INSTRUCTIONS).toMatch(/list_interviews/);
  });

  it('explains the first-use authorization flow', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/authoriz/i);
    expect(MCP_INSTRUCTIONS).toMatch(/Approve/);
  });

  it('shows example prompts so the user has a starting point', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/List my studies/i);
  });

  it('mentions the study.results synthesis capability', () => {
    expect(MCP_INSTRUCTIONS).toMatch(/results/);
    expect(MCP_INSTRUCTIONS).toMatch(/synthesis/i);
  });
});
