// Translate only the bounded SQLite dialect used by the retained v38 queries.
// Values are always bound separately; no user-provided SQL or identifiers are accepted.
const qualified = new Set(['audit','batches','records','temple_registry','temple_registry_meta',
  'organization_registry','organization_registry_meta','province_region_meta','exam_statistics',
  'retained_exam_statistics','statistics_sources','passlist_json_each','passlist_number']);
const numeric = new Set(['year','row','order','source_row','source_end_row','sect_reviewed','vassa',
  'birth_year','age_at_exam','birth_year_estimated','age_estimated','birth','age','birthEstimated','ageEstimated',
  'sent','absent','retained','passed','failed','other']);
export function toPostgres(input) {
  let sql = input.trim().replace(/;$/, '');
  const ignore = /^INSERT OR IGNORE\b/i.test(sql);
  sql = sql.replace(/^INSERT OR IGNORE\b/i, 'INSERT');
  sql = sql.replace(/json_extract\((\w+(?:\.\w+)?),'\$\.([\w]+)'\)/g, (_,value,key) =>
    `((${value}->>'${key}')${numeric.has(key)?'::bigint':''})`);
  sql = sql.replace(/json_extract\((\w+(?:\.\w+)?),'\$\[(\d+)\]'\)/g, '($1->>$2)');
  sql = sql.replace(/json_each\(/g, 'passlist_json_each(');
  sql = sql.replace(/GROUP_CONCAT\(DISTINCT ([^()]+)\)/gi, "STRING_AGG(DISTINCT ($1)::text, ',')");
  sql = sql.replace(/json_array\(/g, 'jsonb_build_array(');
  sql = sql.replace(/lower\(hex\(randomblob\(16\)\)\)/gi, 'gen_random_uuid()::text');
  // json_object is used for audit text, including nested JSON numeric values.
  let index = sql.indexOf('json_object(');
  while (index !== -1) {
    let depth=1, quote=false, end=index+12;
    for (;end<sql.length&&depth;end++) {
      if(sql[end]==="'") {if(quote&&sql[end+1]==="'"){end++;continue;}quote=!quote;}
      if(!quote){if(sql[end]==='(')depth++;if(sql[end]===')')depth--;}
    }
    let args=sql.slice(index+12,end-1).replace(/,\s*\?(?=[,)]|$)/g,',CAST(? AS text)');
    args=args.replace(/'groupCount',CAST\(\? AS text\)/g,"'groupCount',CAST(? AS bigint)");
    sql=sql.slice(0,index)+'(jsonb_build_object('+args+')::text)'+sql.slice(end);
    index=sql.indexOf('json_object(');
  }
  sql=sql.replace(/\bJOIN (passlist_json_each\([^)]*\)\s+(?:AS\s+)?\w+)\s+WHERE/gi,'CROSS JOIN $1 WHERE');
  // A scalar JSON array supplies fingerprint strings in the duplicate lookup.
  sql=sql.replace(/r\.fingerprint=j\.value\b/g,"r.fingerprint=(j.value#>>'{}')");
  if(ignore)sql+=' ON CONFLICT DO NOTHING';
  let parameter=0, quoted=false, output='';
  for(let i=0;i<sql.length;i++){
    const char=sql[i];
    if(char==="'"){output+=char;if(quoted&&sql[i+1]==="'"){output+=sql[++i];continue;}quoted=!quoted;}
    else if(!quoted&&/[a-zA-Z_]/.test(char)){
      let end=i+1;while(end<sql.length&&/[a-zA-Z0-9_]/.test(sql[end]))end++;
      const word=sql.slice(i,end);output+=(qualified.has(word)&&sql[i-1]!=='.'?'passlist.':'')+word;i=end-1;
    }else output+=char==='?'&&!quoted?'$'+(++parameter):char;
  }
  return {sql:output,parameters:parameter};
}
