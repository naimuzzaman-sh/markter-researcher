import { describe, it, expect } from 'vitest';
import { chatMessageSchema, setupSessionSchema } from './setup-session.type';

describe('chatMessageSchema', () => {
  it('should validate a user message', () => {
    const result = chatMessageSchema.safeParse({
      role: 'user',
      content: 'I want to research fitness apps',
    });
    expect(result.success).toBe(true);
  });

  it('should validate an assistant message', () => {
    const result = chatMessageSchema.safeParse({
      role: 'assistant',
      content: 'Who are the target users?',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const result = chatMessageSchema.safeParse({
      role: 'system',
      content: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty content', () => {
    const result = chatMessageSchema.safeParse({
      role: 'user',
      content: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('setupSessionSchema', () => {
  it('should validate a session with messages', () => {
    const result = setupSessionSchema.safeParse({
      id: 'session-123',
      messages: [{ role: 'user', content: 'Hello' }],
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should allow empty message history', () => {
    const result = setupSessionSchema.safeParse({
      id: 'session-123',
      messages: [],
      createdAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing id', () => {
    const result = setupSessionSchema.safeParse({
      messages: [],
      createdAt: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
