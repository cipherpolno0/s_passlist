import {normalizeProvince,normalizeRegion} from './scope';
import type {PassRecord} from './constants';
export const PROVINCE_REGION_VERSION='admin-province-regions-2026-10-20-v1';
// Exact regional grouping supplied by the administrator. Bangkok has no numbered entry.
export const REGION_PROVINCES:Readonly<Record<number,readonly string[]>>={
 1:['นนทบุรี','ปทุมธานี','สมุทรปราการ'],2:['พระนครศรีอยุธยา','อ่างทอง','สระบุรี'],3:['ลพบุรี','สิงห์บุรี','ชัยนาท','อุทัยธานี'],4:['นครสวรรค์','กำแพงเพชร','พิจิตร','เพชรบูรณ์'],5:['พิษณุโลก','สุโขทัย','อุตรดิตถ์','ตาก'],6:['ลำปาง','เชียงราย','พะเยา','แพร่','น่าน'],7:['เชียงใหม่','ลำพูน','แม่ฮ่องสอน'],8:['อุดรธานี','หนองคาย','บึงกาฬ','เลย','สกลนคร','หนองบัวลำภู'],9:['ขอนแก่น','มหาสารคาม','กาฬสินธุ์','ร้อยเอ็ด'],10:['อุบลราชธานี','ยโสธร','ศรีสะเกษ','นครพนม','มุกดาหาร','อำนาจเจริญ'],11:['นครราชสีมา','บุรีรัมย์','ชัยภูมิ','สุรินทร์'],12:['ปราจีนบุรี','สระแก้ว','นครนายก','ฉะเชิงเทรา'],13:['ชลบุรี','ระยอง','จันทบุรี','ตราด'],14:['นครปฐม','สุพรรณบุรี','กาญจนบุรี','สมุทรสาคร'],15:['ราชบุรี','เพชรบุรี','สมุทรสงคราม','ประจวบคีรีขันธ์'],16:['นครศรีธรรมราช','ชุมพร','สุราษฎร์ธานี'],17:['ภูเก็ต','ตรัง','กระบี่','พังงา','ระนอง'],18:['สงขลา','พัทลุง','สตูล','ปัตตานี','ยะลา','นราธิวาส'],
};
export const PROVINCE_REGION:Readonly<Record<string,string>>=Object.fromEntries(Object.entries(REGION_PROVINCES).flatMap(([region,provinces])=>provinces.map(province=>[province,`ภาค ${region}`])));
export function regionForProvince(province:string){const name=normalizeProvince(province);return Object.hasOwn(PROVINCE_REGION,name)?PROVINCE_REGION[name]:'';}
const warningPrefix='ภาคไม่ตรงกับตารางจังหวัดของผู้ดูแล:';
export function applyProvinceRegion(record:Pick<PassRecord,'province'|'region'|'jurisdiction'|'warnings'>){
 const before=record.region,warnings=record.warnings.join('\n'),expected=record.jurisdiction==='ส่วนกลาง'?'':regionForProvince(record.province);
 record.warnings=record.warnings.filter(w=>!w.startsWith(warningPrefix));
 if(expected){
  if(!record.region.trim()){record.region=expected;record.warnings=record.warnings.filter(w=>!w.startsWith('ไม่ระบุภาค'));}
  else{const normalized=normalizeRegion(record.region),parts=normalized.replace(/^ภาค /,'').split('-');if(!parts.includes(expected.replace('ภาค ','')))record.warnings.push(`${warningPrefix} ${record.province} อยู่${expected} แต่ไฟล์ระบุ ${record.region} (คงค่าตามไฟล์)`);}
 }
 return {filled:before!==record.region,changed:before!==record.region||warnings!==record.warnings.join('\n'),expected};
}
