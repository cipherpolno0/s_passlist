import 'server-only';
import {database} from './database';
import {bucket} from './storage';
// No connection is opened at import/build time; environment is read at request time.
export const env = {DB:database,BUCKET:bucket,get ADMIN_EMAILS(){return process.env.ADMIN_EMAILS||'';}};
