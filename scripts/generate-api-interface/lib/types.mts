/**
 * Types for the `middlewared --dump-api` format (our input contract) and the
 * generator's intermediate representation.
 *
 * If middleware changes the dump shape (e.g. the requested $defs-preserving
 * variant, or a structured `job` flag — see MIDDLEWARE-ASKS.md), update these
 * first and let the compiler produce the migration checklist.
 */

/**
 * A JSON Schema node as pydantic emits it. Deliberately loose: only the
 * keywords the generator interprets are modeled; everything else flows
 * through the index signature untouched.
 */
export interface Schema {
  $ref?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  items?: Schema | false;
  prefixItems?: Schema[];
  properties?: Record<string, Schema>;
  patternProperties?: Record<string, Schema>;
  additionalProperties?: Schema | boolean;
  required?: string[];
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  /** json-schema-to-typescript extension: emit this exact TS type expression. */
  tsType?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Dump format (input)
// ---------------------------------------------------------------------------

export interface ApiDumpMethod {
  name: string;
  roles: string[];
  doc: string | null;
  /** `{type: 'object', properties: {'Call parameters': ..., 'Return value': ...}}` */
  schemas: Schema;
  removed_in: string | null;
  input_pipes?: boolean;
  output_pipes?: boolean;
  check_pipes?: boolean;
}

export interface ApiDumpEvent {
  name: string;
  roles: string[];
  doc: string | null;
  /** `{type: 'object', properties: {ADDED?, CHANGED?, REMOVED?, 'Subscription parameters'?}}` */
  schemas: Schema;
  removed_in: string | null;
}

export interface ApiDumpVersion {
  version: string;
  version_title: string;
  methods: ApiDumpMethod[];
  events: ApiDumpEvent[];
}

/** `middlewared --dump-api` emits `{versions: [...]}`; a pre-sliced single version is also accepted. */
export interface ApiDumpFile {
  versions?: ApiDumpVersion[];
}

// ---------------------------------------------------------------------------
// Intermediate representation (preprocessor output, emitter input)
// ---------------------------------------------------------------------------

export type DefKind = 'object' | 'enum';

/** A named, hoisted definition plus generator-internal metadata. */
export interface DefSchema extends Schema {
  _kind?: DefKind;
  _usedBy?: string[];
}

export interface MethodParam {
  name: string;
  optional: boolean;
  doc: string | null;
  schema: Schema;
}

export interface MethodModel {
  name: string;
  doc: string | null;
  roles: string[];
  removedIn: string | null;
  job: boolean;
  params: MethodParam[];
  returns: Schema;
}

export interface EventModel {
  name: string;
  doc: string | null;
  roles: string[];
  /** Keyed by dump variant: ADDED / CHANGED / REMOVED / 'Subscription parameters'. */
  models: Record<string, Schema>;
}

export interface VersionModel {
  version: string;
  definitions: Record<string, DefSchema>;
  methods: MethodModel[];
  events: EventModel[];
}
