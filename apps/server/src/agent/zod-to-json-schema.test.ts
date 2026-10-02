import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from './zod-to-json-schema';

describe('zodToJsonSchema', () => {
  it('converts a simple object with string + number', () => {
    const s = z.object({ name: z.string(), age: z.number() });
    const json = zodToJsonSchema(s) as {
      type: string;
      properties: Record<string, { type: string }>;
      required: string[];
    };
    expect(json.type).toBe('object');
    expect(json.properties.name.type).toBe('string');
    expect(json.properties.age.type).toBe('number');
    expect(json.required).toContain('name');
    expect(json.required).toContain('age');
  });

  it('marks optional fields as not required', () => {
    const s = z.object({ name: z.string(), nick: z.string().optional() });
    const json = zodToJsonSchema(s) as { required: string[] };
    expect(json.required).toEqual(['name']);
  });

  it('adds uuid format for z.string().uuid()', () => {
    const s = z.object({ id: z.string().uuid() });
    const json = zodToJsonSchema(s) as {
      properties: { id: { format: string } };
    };
    expect(json.properties.id.format).toBe('uuid');
  });

  it('integer numbers get type integer', () => {
    const s = z.object({ limit: z.number().int() });
    const json = zodToJsonSchema(s) as {
      properties: { limit: { type: string } };
    };
    expect(json.properties.limit.type).toBe('integer');
  });

  it('propagates min/max on numbers', () => {
    const s = z.object({ n: z.number().min(1).max(100) });
    const json = zodToJsonSchema(s) as {
      properties: { n: { minimum: number; maximum: number } };
    };
    expect(json.properties.n.minimum).toBe(1);
    expect(json.properties.n.maximum).toBe(100);
  });

  it('converts arrays with element schema', () => {
    const s = z.object({ tags: z.array(z.string()) });
    const json = zodToJsonSchema(s) as {
      properties: { tags: { type: string; items: { type: string } } };
    };
    expect(json.properties.tags.type).toBe('array');
    expect(json.properties.tags.items.type).toBe('string');
  });

  it('converts enums', () => {
    const s = z.object({ color: z.enum(['red', 'blue']) });
    const json = zodToJsonSchema(s) as {
      properties: { color: { enum: string[] } };
    };
    expect(json.properties.color.enum).toEqual(['red', 'blue']);
  });
});
