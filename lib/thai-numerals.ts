export const toThai=(value:unknown)=>String(value??'').replace(/[0-9]/g,d=>'๐๑๒๓๔๕๖๗๘๙'[Number(d)]);
export const toArabic=(value:unknown)=>String(value??'').replace(/[๐-๙]/g,d=>String(d.charCodeAt(0)-3664));
