import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresSql} from '../lib/postgres.ts';
test('parameter numbers preserve SQL literals and escaped quotes',()=>{
 assert.equal(postgresSql("SELECT '?', 'it''s ?', a FROM records WHERE id=? AND owner_id=?"),"SELECT '?', 'it''s ?', a FROM records WHERE id=$1 AND owner_id=$2");
});
test('ignored inserts keep PostgreSQL conflict handling',()=>{
 assert.equal(postgresSql('INSERT OR IGNORE INTO records(id) VALUES(?)'),'INSERT INTO records(id) VALUES($1) ON CONFLICT DO NOTHING');
});
test('numeric Excel JSON fields are typed but names remain text',()=>{
 assert.equal(postgresSql("SELECT json_extract(j.value,'$.year'),json_extract(j.value,'$.first_name') FROM json_each(?) j"),"SELECT (json_extract(j.value,'$.year'))::bigint,json_extract(j.value,'$.first_name') FROM json_each($1) j");
});
test('audit JSON parameters have deterministic PostgreSQL text types',()=>{
 assert.equal(postgresSql("SELECT json_object('reason',?,'before',json_extract(value,'$.sect')) FROM json_each(?)"),"SELECT jsonb_build_object('reason',$1::text,'before',json_extract(value,'$.sect')) FROM json_each($2)");
});
test('legacy audit IDs and statistics variants use PostgreSQL functions',()=>{
 assert.equal(postgresSql("SELECT lower(hex(randomblob(16))),json_array(year,passed)"),"SELECT replace(gen_random_uuid()::text,'-',''),jsonb_build_array(year,passed)");
});
