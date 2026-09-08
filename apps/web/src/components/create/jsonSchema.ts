/**
 * The slice of JSON Schema the creation forms are generated from.
 *
 * The backend publishes each action type's creation payload as a JSON Schema on
 * `GET /action-types`. Rather than model every keyword, this describes the subset the
 * renderer understands, and treats anything else as a plain text field — an unknown
 * keyword degrades to something usable instead of breaking the form.
 */
export interface JsonSchema {
  type?: string;
  title?: string;
  description?: string;
  enum?: readonly string[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
}

/** The kinds of control the renderer can produce. */
export type FieldKind = 'enum' | 'stringList' | 'number' | 'boolean' | 'url' | 'text';

/**
 * Picks a control for one property schema.
 *
 * Ordered most specific first: an `enum` is a choice whatever its underlying type, and a
 * `format` refines a string that would otherwise be plain text.
 */
export function fieldKind(schema: JsonSchema): FieldKind {
  if (schema.enum !== undefined && schema.enum.length > 0) return 'enum';
  if (schema.type === 'array' && schema.items?.type === 'string') return 'stringList';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'string' && (schema.format === 'uri' || schema.format === 'url')) return 'url';
  return 'text';
}

/** The value a freshly rendered field starts at, by kind. */
export function emptyValue(schema: JsonSchema): unknown {
  switch (fieldKind(schema)) {
    case 'stringList':
      return [];
    case 'boolean':
      return false;
    case 'enum':
      return schema.enum?.[0] ?? '';
    case 'number':
      return undefined;
    default:
      return '';
  }
}

/** A blank payload for a type: every declared property at its empty value. */
export function emptyPayload(schema: JsonSchema): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => [
      name,
      emptyValue(property),
    ]),
  );
}

/** The label for a property: the schema's own title, else the field name humanised. */
export function fieldLabel(name: string, schema: JsonSchema): string {
  if (schema.title !== undefined && schema.title !== '') return schema.title;
  const spaced = name.replaceAll('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The `min` a number input should enforce.
 *
 * JSON Schema's `exclusiveMinimum` has no HTML equivalent, so it is reported as-is and
 * the server stays the authority — the input only stops the obviously wrong values.
 */
export function numberBounds(schema: JsonSchema): { min?: number; max?: number } {
  return {
    min: schema.minimum ?? schema.exclusiveMinimum,
    max: schema.maximum ?? schema.exclusiveMaximum,
  };
}
