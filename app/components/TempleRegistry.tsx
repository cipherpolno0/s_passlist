'use client';
import ThaiNumerals from './ThaiNumerals';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Check,Database,Loader2,RefreshCw,ShieldCheck} from 'lucide-react';

export type TempleRegistryStatus={source:string;version:string;expected:number;loaded:number;ready:boolean;status:string;startedAt:string|null;importedAt:string|null;provinces:number;incompleteAddresses:number;duplicateGroups:number;duplicateExtraRows:number;sects:{sect:string;count:number}[]};
const count=(value:number)=>new Intl.NumberFormat('th-TH-u-nu-thai').format(value);
async function readStatus(){const response=await fetch('/api/temple-registry',{cache:'no-store'}),data=await response.json() as TempleRegistryStatus&{error?:string};if(!response.ok)throw new Error(data.error||'อ่านสถานะทะเบียนวัดไม่สำเร็จ');return data;}

export default function TempleRegistry({active,onStatus}:{active:boolean;onStatus?:(status:TempleRegistryStatus)=>void}){
 const [status,setStatus]=useState<TempleRegistryStatus|null>(null),[working,setWorking]=useState(false),[error,setError]=useState('');
 const mounted=useRef(false),running=useRef(false),onStatusRef=useRef(onStatus),reportedBucket=useRef(-1);onStatusRef.current=onStatus;
 const update=useCallback((next:TempleRegistryStatus)=>{setStatus(next);const bucket=next.ready?Number.MAX_SAFE_INTEGER:Math.floor(next.loaded/2500);if(bucket!==reportedBucket.current){reportedBucket.current=bucket;onStatusRef.current?.(next);}},[]);
 const install=useCallback(async(cancelled:()=>boolean)=>{if(running.current)return;running.current=true;setWorking(true);setError('');try{
  for(let request=0;request<120&&!cancelled();request++){
   const response=await fetch('/api/temple-registry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'seed'})}),data=await response.json() as {loaded:number;expected:number;ready:boolean;error?:string};
   if(!response.ok)throw new Error(data.error||'นำเข้าทะเบียนวัดไม่สำเร็จ');
   const progress:TempleRegistryStatus={source:'Report_Temple.xlsx',version:'report-temple-2026-10-20-v1',expected:data.expected,loaded:data.loaded,ready:data.ready,status:data.ready?'ready':'loading',startedAt:null,importedAt:null,provinces:0,incompleteAddresses:0,duplicateGroups:0,duplicateExtraRows:0,sects:[]};update(progress);
   if(data.ready){update(await readStatus());return;}
  }
  if(!cancelled())throw new Error('การนำเข้ายังไม่เสร็จ กรุณากดดำเนินการต่อ');
 }catch(reason){if(!cancelled())setError((reason as Error).message);}finally{running.current=false;if(!cancelled())setWorking(false);}},[update]);
 useEffect(()=>{let cancelled=false;mounted.current=true;const stop=()=>cancelled||!mounted.current;const bootstrap=async()=>{try{const initial=await readStatus();if(stop())return;update(initial);if(!initial.ready)await install(stop);}catch(reason){if(!stop())setError((reason as Error).message);}};void bootstrap();return()=>{cancelled=true;mounted.current=false;};},[install,update]);
 if(!active)return null;
 const progress=status?Math.min(100,Math.round(status.loaded/Math.max(1,status.expected)*100)):0;
 return <ThaiNumerals><section className="temple-registry"><div className="page-heading"><div><div className="eyebrow">ข้อมูลอ้างอิงสำหรับตรวจไฟล์นำเข้า</div><h1>ทะเบียนวัดอ้างอิง</h1><p>ใช้เทียบชื่อวัด ตำบล อำเภอ จังหวัด และนิกายกับรายชื่อผู้สอบได้</p></div><button className="button secondary" onClick={()=>readStatus().then(update).catch(e=>setError(e.message))} disabled={working}><RefreshCw size={17}/>อัปเดตสถานะ</button></div>
  <div className="info-line banner"><Database size={20}/><p>ระบบเก็บแถวจากไฟล์ {status?.source||'Report_Temple.xlsx'} ไว้ในฐานข้อมูล D1 โดยคงชื่อซ้ำต่างพื้นที่และรายการนิกายที่ขัดแย้งไว้ การเทียบใช้ชื่อวัดร่วมกับข้อมูลพื้นที่ที่มี และแสดงข้อสังเกตให้ผู้ดูแลตรวจเอง ไม่เปลี่ยนนิกายของรายชื่อสอบให้อัตโนมัติ</p></div>
  {error?<div className="alert error" role="alert">{error}</div>:null}
  <section className="card registry-status"><div className="section-heading"><div><h2>สถานะทะเบียนในฐานข้อมูล</h2><p>{status?.version||'กำลังตรวจสอบข้อมูลอ้างอิง'}</p></div><span className={'tag '+(status?.ready?'green':'sand')}>{status?.ready?'ติดตั้งครบ':working?'กำลังนำเข้า':'รอติดตั้ง'}</span></div>
   <div className="review-stats"><div><span>แถวในทะเบียน</span><strong>{count(status?.loaded||0)} / {count(status?.expected||0)}</strong></div><div><span>จังหวัดในไฟล์</span><strong>{status?.ready?count(status.provinces):'—'}</strong></div><div><span>แถวที่ข้อมูลพื้นที่ขาด</span><strong>{status?.ready?count(status.incompleteAddresses):'—'}</strong></div><div><span>กลุ่มชื่อและพื้นที่ซ้ำ</span><strong>{status?.ready?count(status.duplicateGroups):'—'}</strong></div></div>
   <progress className="registry-progress" value={status?.loaded||0} max={status?.expected||1} aria-label="ความคืบหน้าการนำเข้าทะเบียนวัด"/>
   {working?<p className="muted">กำลังบันทึกข้อมูลในฐานข้อมูล {progress}% · สามารถเปิดหน้านำเข้า Excel เพื่อตรวจไฟล์ได้เมื่อรายการครบ</p>:status?.ready?<p className="muted">นำเข้าครบ {count(status.expected)} แถว · อัปเดต {status.importedAt?new Date(status.importedAt).toLocaleString('th-TH'): '—'} · เก็บรายการซ้ำไว้ {count(status.duplicateExtraRows)} แถว</p>:<p className="muted">เมื่อผู้ดูแลเปิดระบบครั้งแรก ระบบจะนำเข้าและดำเนินการต่อจากจุดเดิมโดยอัตโนมัติ หากหยุดกลางทางสามารถกดต่อได้</p>}
   <div className="registry-sects">{(status?.sects||[]).map(item=><span className="tag" key={item.sect}>{item.sect} · {count(item.count)}</span>)}</div>
   <div className="button-group"><button className="button primary" onClick={()=>install(()=>!mounted.current)} disabled={working||!!status?.ready}>{working?<><Loader2 size={17} className="spin"/>กำลังนำเข้า…</>:status?.ready?<><Check size={17}/>นำเข้าครบแล้ว</>:<><ShieldCheck size={17}/>{status?.loaded?'ดำเนินการนำเข้าต่อ':'เริ่มนำเข้าทะเบียน'}</>}</button></div>
  </section>
  <section className="card"><div className="section-heading"><h2>การตรวจเทียบระหว่างอัปโหลด</h2></div><ol className="registry-steps"><li>ระบบค้นหาวัดด้วยชื่อที่ปรับช่องว่างและคำนำหน้า “วัด” แล้วเทียบตำบล อำเภอ และจังหวัดจากไฟล์ เมื่อมีข้อมูล</li><li>ถ้าพบชื่อซ้ำในคนละพื้นที่ ระบบแยกตามที่อยู่ ถ้าพื้นที่ขาดหรือทะเบียนมีนิกายไม่ตรงกัน จะแสดงเป็นข้อสังเกตในหน้าตรวจทานและรายงาน CSV</li><li>ระบบไม่แก้ข้อมูลผู้สอบและไม่ตัดแถวที่ไม่พบออก ผู้ดูแลตรวจและเลือกนิกายภายหลังได้ที่ “ตรวจนิกายตามวัด / พื้นที่”</li></ol></section>
 </section></ThaiNumerals>;
}
