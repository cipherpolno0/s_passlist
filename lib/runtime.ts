import {database,bucket} from './postgres';
// Only server modules import this adapter. Supabase holds relational data and private source files.
export const env={DB:database as unknown as D1Database,BUCKET:bucket as unknown as R2Bucket,ADMIN_EMAILS:process.env.ADMIN_EMAILS||''};
