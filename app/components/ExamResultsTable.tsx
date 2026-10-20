'use client';
import ThaiNumerals from './ThaiNumerals';
import {certificateNumber} from '../../lib/certificate-number';
import {ArrowUpRight,Pencil,Trash2} from 'lucide-react';
import {vassaDisplay} from '../../lib/vassa';
import {examAgeValueDisplay} from '../../lib/exam-age';
import {examLevelLabel} from '../../lib/result-display';
export type ExamResult={sequence?:string;certificate_number?:string;id:string;category:string;level:string;title:string;first_name:string;last_name:string;dharma_name:string;sect:string;region:string;province:string;school:string;temple:string;district:string;jurisdiction?:unknown;year:number;birth_year:number|null;age_at_exam:number|null;birth_year_estimated:number;age_estimated:number;vassa:number|null};
type Props<T extends ExamResult>={rows:T[];onDetail:(row:T)=>void;onEdit?:(row:T)=>void;onTrash?:(row:T)=>void;busy?:boolean};
export default function ExamResultsTable<T extends ExamResult>({rows,onDetail,onEdit,onTrash,busy=false}:Props<T>){
 const categories=[...new Set(rows.map(row=>row.category))].sort((a,b)=>a==='นักธรรม'?-1:b==='นักธรรม'?1:a.localeCompare(b,'th'));
 return <ThaiNumerals><>{categories.map(category=>{
  const items=rows.filter(row=>row.category===category),monastic=category==='นักธรรม';
  const widths=monastic?[6,6,4,6,8,6,7,7,7,5,4,11,8,9,6]:[6,6,4,6,8,6,7,7,5,11,8,9,6];
  const totalWidth=widths.reduce((sum,width)=>sum+width,0);
  return <ThaiNumerals key={category}><div className="result-group" key={category}>
   {categories.length>1?<h3 className="result-group-title">{category}</h3>:null}
   <div className="table-wrap results-table-wrap"><table className="results-table"><colgroup>{widths.map((width,index)=><col key={index} style={{width:`${width/totalWidth*100}%`}}/>)}</colgroup><caption className="sr-only">ผลการสืบค้น{category}</caption><thead><tr>
    <th scope="col">ปีการศึกษา</th><th scope="col">นิกาย</th><th scope="col">ภาค</th><th scope="col">ชั้น</th><th scope="col">เลขที่ ปกศ.</th><th scope="col">คำนำหน้า</th><th scope="col">ชื่อ</th>{monastic?<th scope="col">ฉายา</th>:null}<th scope="col">นามสกุล</th><th scope="col">อายุ</th>{monastic?<th scope="col">พรรษา</th>:null}<th scope="col">สังกัดวัด</th><th scope="col">อำเภอ</th><th scope="col">จังหวัด</th><th scope="col"><span className="sr-only">จัดการรายชื่อ</span></th>
   </tr></thead><tbody>{items.map(row=><tr key={row.id}>
    <td data-label="ปีการศึกษา" className="numeric">{row.year}</td>
    <td data-label="นิกาย" title={row.sect||'ไม่ระบุนิกาย'}>{row.sect==='มหานิกาย'?'ม.':row.sect==='ธรรมยุต'?'ธ.':row.sect||'ไม่ระบุนิกาย'}</td>
    <td data-label="ภาค">{row.region?row.region.replace(/^ภาค\s*/,''):String(row.jurisdiction||'ไม่ระบุภาค')}</td>
    <td data-label="ชั้น"><span className={monastic?'tag green':'tag sand'}>{examLevelLabel(row.category,row.level)}</span></td>
    <td data-label="เลขที่ ปกศ.">{certificateNumber(row)}</td>
    <td data-label="คำนำหน้า">{row.title||'—'}</td>
    <td data-label="ชื่อ"><button className="name-button" onClick={()=>onDetail(row)}>{row.first_name||'—'}</button></td>
    {monastic?<td data-label="ฉายา">{row.dharma_name||'—'}</td>:null}
    <td data-label="นามสกุล">{row.last_name||'—'}</td>
    <td data-label="อายุ" title={'อายุ ณ ปีที่สอบผ่าน พ.ศ. '+row.year+(row.age_estimated?' (คำนวณจากปีเกิดโดยประมาณ)':'')}>{examAgeValueDisplay(row.age_at_exam)}</td>
    {monastic?<td data-label="พรรษา">{vassaDisplay(row.vassa,row.category,row.title)}</td>:null}
    <td data-label="สังกัดวัด"><span className="public-school">{row.temple||'ไม่ระบุ'}</span></td>
    <td data-label="อำเภอ">{row.district||'ไม่ระบุ'}</td>
    <td data-label="จังหวัด">{row.province||'ไม่ระบุ'}</td><td data-label="จัดการรายชื่อ"><div className="row-actions">{onEdit?<button className="icon-button" aria-label={'แก้ไข '+row.first_name} title="แก้ไขข้อมูล" onClick={()=>onEdit(row)}><Pencil size={17}/></button>:null}{onTrash?<button className="icon-button danger" disabled={busy} aria-label={'ย้ายไปถังขยะ '+row.first_name} title="ย้ายไปถังขยะ" onClick={()=>onTrash(row)}><Trash2 size={17}/></button>:null}{!onEdit&&!onTrash?<button className="icon-button" aria-label={'ดูข้อมูล '+row.first_name} onClick={()=>onDetail(row)}><ArrowUpRight size={17}/></button>:null}</div></td>
   </tr>)}</tbody></table></div>
  </div></ThaiNumerals>;
 })}</></ThaiNumerals>;
}
