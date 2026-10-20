import 'server-only';
import postgres from 'postgres';
import {toPostgres} from './sql.mjs';
import type {Database, Statement, QueryResult, Row} from './types';
type Executor = (sql: string, values: unknown[]) => Promise<{rows: Row[]; count: number}>;
export class PgStatement implements Statement {
  constructor(readonly source: string, readonly execute: Executor, readonly values: unknown[] = []) {}
  bind(...values: unknown[]) { return new PgStatement(this.source, this.execute, values); }
  async all<T = Row>(): Promise<QueryResult<T>> {
    const query=toPostgres(this.source);
    if(query.parameters!==this.values.length)throw new Error('SQL parameter count mismatch');
    const result=await this.execute(query.sql,this.values);
    return {results:result.rows as T[],success:true,meta:{changes:result.count}};
  }
  async first<T = Row>(column?: string): Promise<T | null> {
    const result=await this.all<Row>();const row=result.results[0];
    return (row?(column?row[column]:row):null) as T | null;
  }
  run() {return this.all();}
}
let pool: ReturnType<typeof postgres> | undefined;
function client() {
  if(!process.env.DATABASE_URL)throw new Error('ยังไม่ได้ตั้งค่า DATABASE_URL สำหรับ Supabase PostgreSQL');
  return pool??=postgres(process.env.DATABASE_URL,{
    prepare:false,max:3,idle_timeout:20,connect_timeout:10,
    ssl:process.env.NODE_ENV==='production'?'verify-full':undefined,
    onnotice:()=>{},
    types:{bigint:{to:20,from:[20,1700],serialize:String,parse:(value:string)=>{const number=Number(value);if(!Number.isSafeInteger(number))throw new Error('Database integer exceeds safe range');return number;}}},
  });
}
function executor(connection: ReturnType<typeof postgres> | postgres.TransactionSql): Executor {
  return async (sql,values)=>{
    const rows=await connection.unsafe(sql,values as postgres.ParameterOrJSON<never>[]);
    return {rows:[...rows] as Row[],count:rows.count};
  };
}
export const database: Database = {
  prepare(sql) {return new PgStatement(sql,(query,values)=>executor(client())(query,values));},
  async batch(statements) {
    // Preserve the v38 all-or-nothing import/audit and optimistic concurrency guards.
    return await client().begin('isolation level serializable',async transaction=>{
      const results: QueryResult[]=[];
      for(const statement of statements){
        if(!(statement instanceof PgStatement))throw new Error('Invalid database statement');
        results.push(await new PgStatement(statement.source,executor(transaction),statement.values).run());
      }
      return results;
    }) as unknown as QueryResult[];
  },
};
