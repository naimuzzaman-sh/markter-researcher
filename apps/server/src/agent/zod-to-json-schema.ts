import type { z } from 'zod';

/**
 * Tiny Zod → JSON Schema converter for Gemini function declarations.
 * Supports the shape we actually use in tools: z.object with string/number/
 * boolean/enum/uuid/url/array/nullable/optional fields. Not a general-
 * purpose converter — if we need more, swap in `zod-to-json-schema` npm
 * package (already a dep of `apps/mcp`). For now, zero extra deps.
 */

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: Array<string | number | boolean | null>;
  description?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
  anyOf?: JsonSchema[];
};

type ZodDef = {
  typeName?: string;
  schema?: { _def?: ZodDef };
  type?: { _def?: ZodDef };
  innerType?: { _def?: ZodDef };
  shape?: () => Record<string, { _def?: ZodDef }>;
  values?: string[];
  checks?: Array<{ kind: string; value?: number }>;
  element?: { _def?: ZodDef };
  options?: Array<{ _def?: ZodDef }>;
};

function convertInner(def: ZodDef | undefined): JsonSchema {
  if (!def) return {};

  switch (def.typeName) {
    case 'ZodObject': {
      const shape = def.shape?.() ?? {};
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        const childDef = (child as { _def?: ZodDef })._def;
        properties[key] = convertInner(childDef);
        if (childDef?.typeName !== 'ZodOptional' && childDef?.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }
      return { type: 'object', properties, required };
    }
    case 'ZodString': {
      const schema: JsonSchema = { type: 'string' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'uuid') schema.format = 'uuid';
        if (check.kind === 'url') schema.format = 'uri';
        if (check.kind === 'email') schema.format = 'email';
        if (check.kind === 'max' && typeof check.value === 'number') {
          (schema as JsonSchema & { maxLength?: number }).maxLength = check.value;
        }
      }
      return schema;
    }
    case 'ZodNumber': {
      const schema: JsonSchema = { type: 'number' };
      for (const check of def.checks ?? []) {
        if (check.kind === 'min' && typeof check.value === 'number') schema.minimum = check.value;
        if (check.kind === 'max' && typeof check.value === 'number') schema.maximum = check.value;
        if (check.kind === 'int') schema.type = 'integer';
      }
      return schema;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: def.values ?? [] };
    case 'ZodArray':
      // Zod stores the element type as `def.type` (v3) OR `def.element` (v4+).
      // Support both so we don't break across Zod upgrades.
      return {
        type: 'array',
        items: convertInner(def.type?._def ?? def.element?._def),
      };
    case 'ZodOptional':
    case 'ZodDefault':
      return convertInner(def.innerType?._def);
    case 'ZodNullable': {
      const inner = convertInner(def.innerType?._def);
      inner.nullable = true;
      return inner;
    }
    case 'ZodUnion':
      return { anyOf: (def.options ?? []).map((o) => convertInner(o._def)) };
    default:
      return { type: 'string' };
  }
}

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  return convertInner(def) as unknown as Record<string, unknown>;
}
