'use client';
import ThaiNumerals from './ThaiNumerals';
import Pagination from './Pagination';
import PageSizeSelect from './PageSizeSelect';
import {pagination} from '../../lib/pagination';
import {useState} from 'react';
import {CENTRAL_SCHOOLS,CENTRAL_SCHOOL_KINDS,type findCentralSchool} from '../../lib/central-schools';
type School=NonNullable<ReturnType<typeof findCentralSchool>>;
export default function CentralDirectory({onSelect,action='เลือกสำนักเรียน'}:{onSelect:(school:School)=>void;action?:string}){
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25);
 const [q,setQ]=useState(''),[sect,setSect]=useState(''),[kind,setKind]=useState('');
 const items=CENTRAL_SCHOOLS.filter(s=>(!sect||s.sect===sect)&&(!kind||s.kind===kind)&&(!q||s.name.includes(q.trim())||s.code.includes(q.trim())));
 const paging=pagination(items.length,new URLSearchParams({page:String(page),pageSize:String(pageSize)}));
 return <ThaiNumerals><details className="card central-directory"><summary>ทะเบียนสำนักเรียนส่วนกลาง · กรุงเทพมหานคร <span className="count-badge">{CENTRAL_SCHOOLS.length} แห่ง</span></summary><p className="muted">กลาง ม. = ส่วนกลาง มหานิกาย · กลาง ธ. = ส่วนกลาง ธรรมยุต</p><div className="directory-filters"><label className="field"><span>ค้นหาสำนักเรียนในทะเบียน</span><input value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="ชื่อวัด หรือคณะเขต" maxLength={120}/></label><label className="field"><span>นิกาย</span><select value={sect} onChange={e=>{setSect(e.target.value);setPage(1);}}><option value="">ทุกนิกาย</option><option>มหานิกาย</option><option>ธรรมยุต</option></select></label><label className="field"><span>ชนิดสำนักเรียน</span><select value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}><option value="">ทุกชนิด</option>{CENTRAL_SCHOOL_KINDS.map(k=><option key={k} value={k}>{k}</option>)}</select></label></div><div className="table-wrap directory-table"><table><thead><tr><th>รหัส / นิกาย</th><th>สำนักเรียน</th><th>ชนิด</th><th/></tr></thead><tbody>{items.slice(paging.offset,paging.offset+pageSize).map(s=><tr key={s.name}><td>{s.code}<small>{s.sect}</small></td><td>{s.name}</td><td>{s.kind}</td><td><button type="button" className="button secondary small" onClick={()=>onSelect(s)} aria-label={`${action} ${s.name}`}>{action}</button></td></tr>)}</tbody></table>{!items.length?<p className="muted">ไม่พบชื่อที่ตรงกับคำค้น</p>:null}</div><div className="pagination"><div className="pagination-summary"><PageSizeSelect value={pageSize} onChange={size=>{setPageSize(size);setPage(1);}}/><span>{items.length} รายการ</span></div><Pagination page={paging.page} pages={paging.pages} onChange={setPage}/></div><p className="table-note">พบ {items.length} แห่ง · รายการอ้างอิงตามที่ผู้ดูแลให้มา ไม่ใช่จำนวนสำนักเรียนที่มีผลสอบเผยแพร่ คณะสงฆ์จีนนิกายและอนัมนิกายจัดเป็นกลาง ม. ตามรายการนี้ ข้อมูลย้อนหลังและชื่อที่ไม่ตรงต้องตรวจต้นฉบับ</p></details></ThaiNumerals>;
}
