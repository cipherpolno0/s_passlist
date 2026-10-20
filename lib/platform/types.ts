export type Row = Record<string, unknown>;
export type QueryResult<T = Row> = { results: T[]; success: boolean; meta: { changes: number } };
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = Row>(): Promise<QueryResult<T>>;
  first<T = Row>(column?: string): Promise<T | null>;
  run(): Promise<QueryResult>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<QueryResult[]>;
}
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}
export interface ObjectBucket {
  get(key: string): Promise<StoredObject | null>;
  put(key: string, value: string | Uint8Array, options?: {httpMetadata?: {contentType?: string}}): Promise<void>;
  delete(keys: string | string[]): Promise<void>;
}
