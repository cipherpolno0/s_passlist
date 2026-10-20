// A record is in the trash when its latest lifecycle event is a soft delete.
// The alias is always an internal SQL alias supplied by application code.
export function latestRecordState(alias = 'r') {
  return `(SELECT a.action FROM audit a WHERE a.owner_id=${alias}.owner_id AND a.target_id=${alias}.id AND a.action IN ('trash-record','restore-record') ORDER BY a.created_at DESC,a.id DESC LIMIT 1)`;
}

export function activeRecord(alias = 'r') {
  return `COALESCE(${latestRecordState(alias)},'')<>'trash-record'`;
}

export function trashedRecord(alias = 'r') {
  return `${latestRecordState(alias)}='trash-record'`;
}
