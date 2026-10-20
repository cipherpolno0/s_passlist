'use client';
import ThaiNumerals from './ThaiNumerals';
import Pagination from './Pagination';
import PageSizeSelect from './PageSizeSelect';
import {pagination} from '../../lib/pagination';
import {regionForProvince} from '../../lib/province-regions';
import {toArabic} from '../../lib/thai-numerals';
import { useState } from 'react';
import { PROVINCE_ABBREVIATIONS } from '../../lib/province-abbreviations';

export default function ProvinceDirectory(){
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25);
 const [query,setQuery]=useState('');
 const q=query.trim().replace(/[.\s]/g,'');
 const regionNumber=Number(toArabic(query.trim()).replace(/^ภาค\s*/,''));
 const entries=Object.entries(PROVINCE_ABBREVIATIONS).filter(([province,abbreviation])=>!q||(Number.isInteger(regionNumber)&&regionNumber>=1&&regionNumber<=18?regionForProvince(province)===`ภาค ${regionNumber}`:province.includes(q)||abbreviation.includes(q))).sort((a,b)=>Number(regionForProvince(a[0]).replace('ภาค ','')||99)-Number(regionForProvince(b[0]).replace('ภาค ','')||99)||a[0].localeCompare(b[0],'th'));
 const paging=pagination(entries.length,new URLSearchParams({page:String(page),pageSize:String(pageSize)}));
 return <ThaiNumerals><details className="card central-directory"><summary>ทะเบียนจังหวัด ชื่อย่อ และภาค · 77 จังหวัด</summary><p className="muted">ใช้ชื่อย่อตามรายการของผู้ดูแล เช่น พล = พิษณุโลก และ กท = กรุงเทพมหานคร ระบบแปลงเป็นชื่อเต็มและเติมภาคตามจังหวัดเมื่อ Excel ไม่ได้ระบุ โดยใช้ตาราง 76 จังหวัด ภาค 1–18 ตามรายการของผู้ดูแล กรุงเทพมหานครเป็นส่วนกลาง</p><label className="field"><span>ค้นหาจังหวัด ชื่อย่อ หรือภาค</span><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="เช่น พิษณุโลก พล หรือ ภาค ๕" maxLength={100}/></label><div className="table-wrap directory-table"><table><thead><tr><th>ภาค</th><th>จังหวัด / สำนักเรียนคณะจังหวัด</th><th>ชื่อย่อ</th></tr></thead><tbody>{entries.slice(paging.offset,paging.offset+pageSize).map(([province,abbreviation])=><tr key={province}><td>{regionForProvince(province)||'ส่วนกลาง'}</td><td>{province}</td><td>{abbreviation}</td></tr>)}</tbody></table></div>{!entries.length?<p className="muted">ไม่พบจังหวัดหรือชื่อย่อ</p>:null}<div className="pagination"><div className="pagination-summary"><PageSizeSelect value={pageSize} onChange={size=>{setPageSize(size);setPage(1);}}/><span>{entries.length} รายการ</span></div><Pagination page={paging.page} pages={paging.pages} onChange={setPage}/></div><p className="table-note">ชื่อย่อใช้กับช่องจังหวัดเท่านั้น เช่น นธ = นราธิวาส ไม่ใช้เปลี่ยนชื่อบุคคลหรือประเภทการสอบ ข้อมูลในระบบยังแสดงและบันทึกเป็นชื่อจังหวัดเต็ม</p></details></ThaiNumerals>;
}
