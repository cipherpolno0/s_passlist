'use client';
import ThaiNumerals from './ThaiNumerals';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {certificateNumber} from '../../lib/certificate-number';
import {toArabic} from '../../lib/thai-numerals';
import {vassaDisplay} from '../../lib/vassa';
import {ageDisplay,examAgeDisplay} from '../../lib/exam-age';
import ExamResultsTable from './ExamResultsTable';
import {affiliationLabel,studyCenterLabel} from '../../lib/result-display';
import Pagination from './Pagination';
import PageSizeSelect from './PageSizeSelect';
import { ArrowUpRight, BookOpen, CheckCircle2, Loader2, Search, ShieldCheck, X } from 'lucide-react';

type PublicRow = { certificate_number?:string;vassa:number|null;birth_year:number|null;age_at_exam:number|null;birth_year_estimated:number;age_estimated:number;id: string; year: number; sect: string; region: string; province: string; category: string; level: string; title: string; first_name: string; last_name: string; dharma_name: string; temple: string; district: string; subdistrict: string; school: string; jurisdiction: string; school_kind: string };
type NamePair = { firstName: string; lastName: string };
const blank: NamePair = { firstName: '', lastName: '' };
const num = (n: number) => new Intl.NumberFormat('th-TH-u-nu-thai').format(n || 0);

async function request<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const res = await fetch('/api/public?' + params, { signal });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error || 'สืบค้นไม่สำเร็จ');
  return data as T;
}

function nameParams(names: NamePair) {
  const params = new URLSearchParams();
  params.set('firstName', names.firstName.trim());
  params.set('lastName', names.lastName.trim());
  return params;
}

export default function PublicSearch() {
  const [filters, setFilters] = useState<NamePair>(blank);
  const [applied, setApplied] = useState<NamePair | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize,setPageSize]=useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ items: PublicRow[]; total: number; page: number; pages: number }>({ items: [], total: 0, page: 1, pages: 0 });
  const [viewer, setViewer] = useState<{ isAdmin: boolean; signedIn: boolean }>();
  const [person, setPerson] = useState<PublicRow | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const params = new URLSearchParams({ action: 'meta' });
    request<{ viewer: { isAdmin: boolean; signedIn: boolean } }>(params).then(result => setViewer(result.viewer)).catch(() => {});
  }, []);

  useEffect(() => {
    if (person) dialog.current?.showModal();
  }, [person]);

  const search = useCallback(async (names: NamePair, currentPage: number, signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const params = nameParams(names);
      params.set('page', String(currentPage));
      params.set('pageSize',String(pageSize));
      const result = await request<typeof data>(params, signal);
      setData(result);
    } catch (e) {
      if (!signal.aborted) setError((e as Error).message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (!applied) return;
    const controller = new AbortController();
    search(applied, page, controller.signal);
    return () => controller.abort();
  }, [applied, page, search]);

  function update(name: keyof NamePair, value: string) {
    setFilters(old => ({ ...old, [name]: value }));
    setApplied(null);
    setData({ items: [], total: 0, page: 1, pages: 0 });
    setLoading(false);
    setPerson(null);
    setError('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const names = { firstName: filters.firstName.trim(), lastName: filters.lastName.trim() };
    if (!names.firstName || !names.lastName) {
      setApplied(null);
      setData({ items: [], total: 0, page: 1, pages: 0 });
      setLoading(false);
      setError('กรุณากรอกทั้งชื่อและนามสกุลก่อนค้นหา');
      return;
    }
    setError('');
    setApplied(names);
    setPage(1);
  }

  function reset() {
    setFilters(blank);
    setApplied(null);
    setData({ items: [], total: 0, page: 1, pages: 0 });
    setLoading(false);
    setPerson(null);
    setPage(1);
    setError('');
  }

  async function detail(row: PublicRow) {
    if (!applied) return;
    try {
      const params = nameParams(applied);
      params.set('action', 'detail');
      params.set('id', row.id);
      const result = await request<{ record: PublicRow }>(params);
      setPerson(result.record);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return <ThaiNumerals><div className="public-shell">
    <header className="public-header">
      <a className="brand" href="/"><span className="brand-symbol"><BookOpen size={27} /></span><span><strong>ธรรมทะเบียน</strong><small>DHAMMA REGISTRY</small></span></a>
      <div className="public-header-actions"><span className="public-audience-label"><CheckCircle2 size={20} />สืบค้นสำหรับผู้ใช้งานทั่วไป</span><a className="button secondary small" href={viewer?.isAdmin ? '/admin' : '/login?next=/admin'} target="_top">{viewer?.isAdmin ? 'จัดการข้อมูล' : 'เข้าสู่ระบบผู้ดูแล'}<ArrowUpRight size={15} /></a></div>
    </header>

    <main className="public-main">
      <section className="public-intro">
        <div className="eyebrow">ทะเบียนผู้สอบได้ : นักธรรมและธรรมศึกษา ก่อนปี พ.ศ. ๒๕๔๒</div>
        <h1>ค้นหารายชื่อผู้สอบได้<br /><span>ด้วยชื่อและนามสกุล</span></h1>
        <p>กรอกชื่อและนามสกุลบางส่วนได้ อย่างน้อยช่องละหนึ่งตัวอักษร<br />แสดงเฉพาะข้อมูลที่ผู้ดูแลตรวจสอบและเผยแพร่แล้ว</p>
        <div className="public-pills"><span>มหานิกาย / ธรรมยุต</span><span>นักธรรม / ธรรมศึกษา</span><span>ชั้นตรี · โท · เอก</span><span>ข้อมูลที่เผยแพร่แล้ว</span></div>
        <BookOpen className="public-watermark" size={185} aria-hidden="true" />
      </section>

      {error ? <div className="alert error" role="alert">{error}</div> : null}

      <section className="card search-card">
        <div className="section-heading"><h2><Search size={20} />สืบค้นรายชื่อ</h2><span>ไม่ต้องสมัครสมาชิก</span></div>
        <form onSubmit={submit}>
          <div className="public-name-fields">
            <label className="field"><span>ชื่อ (พิมพ์พร้อมคำนำหน้าชื่อได้)</span><input value={filters.firstName} onChange={event => update('firstName', event.target.value)} placeholder="กรอกชื่อหรือบางส่วน" aria-label="ชื่อ จะใส่คำนำหน้าด้วยก็ได้" maxLength={120} autoComplete="given-name" required /></label>
            <label className="field"><span>นามสกุล</span><input value={filters.lastName} onChange={event => update('lastName', event.target.value)} placeholder="กรอกนามสกุลหรือบางส่วน" aria-label="นามสกุล" maxLength={120} autoComplete="family-name" required /></label>
          </div>
          <div className="public-search-actions"><button className="text-button" type="button" onClick={reset}>ล้างข้อมูล</button><button className="button primary" type="submit" disabled={!filters.firstName.trim() || !filters.lastName.trim() || loading}><Search size={17} />ค้นหารายชื่อ</button></div>
        </form>
      </section>

      <section className="card">
        <div className="result-heading"><div><h2>ผลการสืบค้น{applied && !loading ? <span className="count-badge">{num(data.total)} รายชื่อ</span> : null}</h2><p>{applied ? `ค้นหาชื่อ “${applied.firstName}” นามสกุล “${applied.lastName}”` : 'กรอกชื่อและนามสกุลคู่กันเพื่อดูผลสอบ'}</p></div></div>
        {loading ? <div className="empty"><Loader2 size={28} className="spin" /><p>กำลังสืบค้น…</p></div> : data.items.length ? <>
          <ExamResultsTable rows={data.items} onDetail={detail}/>
          <div className="pagination"><div className="pagination-summary"><PageSizeSelect value={pageSize} onChange={size=>{setPageSize(size);setPage(1);}} disabled={loading}/><span>แสดง {(data.page-1)*pageSize+1}–{Math.min(data.page*pageSize,data.total)} จาก {num(data.total)} รายชื่อ</span></div><Pagination page={data.page} pages={data.pages} onChange={setPage} disabled={loading}/></div>
        </> : <Empty searched={!!applied} />}
      </section>

      <p className="table-note">อายุอ้างอิงปีที่สอบผ่าน ไม่ใช่อายุ ณ ปีปัจจุบัน หากคำนวณจากปีโดยไม่มีวันเกิด จะแสดงคำว่า “ประมาณ” และแสดง “-” เมื่อไม่มีข้อมูล</p>
      <div className="public-trust"><ShieldCheck size={18} /><p>ระบบแสดงเฉพาะรายชื่อที่ตรงกับชื่อและนามสกุลที่กรอก และผ่านการเผยแพร่โดยผู้ดูแล</p></div>
      <footer className="page-footer"><span><BookOpen size={15} />ธรรมทะเบียน · ระบบสืบค้นผู้สอบได้</span><a className="text-button" href="/admin">สำหรับผู้ดูแลระบบ<ArrowUpRight size={14} /></a></footer>
    </main>

    {person ? <dialog ref={dialog} className="modal" onCancel={() => setPerson(null)}><header><h2>รายละเอียดผู้สอบได้</h2><button className="icon-button" aria-label="ปิด" onClick={() => setPerson(null)}><X size={20} /></button></header><span className="tag green">{person.category} ชั้น{person.level}</span><h2 className="person-name">{person.title}{person.first_name} {person.last_name}</h2><p className="dharma-name">{person.dharma_name || '—'}</p><dl className="detail-grid">{[['เลข ปกศ.',certificateNumber(person)],['นิกาย', person.sect], ['ภาค', person.region || person.jurisdiction], ['สำนักเรียนคณะจังหวัด', studyCenterLabel(person)], ['ปี พ.ศ.', person.year], ['ปี พ.ศ. เกิด',ageDisplay(person.birth_year,person.birth_year_estimated)], ['อายุ ณ ปีที่สอบผ่าน',examAgeDisplay(person.age_at_exam,person.age_estimated)], ...(person.category==='นักธรรม'? [['พรรษา',vassaDisplay(person.vassa,person.category,person.title)]]:[]), ['ชนิดสำนักเรียน', person.school_kind], [affiliationLabel(person.category), person.temple], ['แขวง / ตำบล', person.subdistrict], ['เขต / อำเภอ', person.district]].map(([key, value]) => <div key={String(key)}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl><div className="modal-actions"><button className="button primary" onClick={() => setPerson(null)}>ปิด</button></div></dialog> : null}
  </div></ThaiNumerals>;
}

function Empty({ searched }: { searched: boolean }) {
  return <ThaiNumerals><div className="empty"><BookOpen size={33} /><h3>{searched ? 'ไม่พบรายชื่อที่ตรงกับข้อมูล' : 'พร้อมสืบค้นรายชื่อ'}</h3><p>{searched ? 'ลองใช้ชื่อและนามสกุลบางส่วนจากบัญชี Excel โดยชื่อจะใส่คำนำหน้าก็ได้ และให้ผู้ดูแลตรวจว่าชุดข้อมูลเผยแพร่แล้ว' : 'ผลสอบจะแสดงเมื่อกรอกทั้งชื่อและนามสกุล อย่างน้อยช่องละหนึ่งตัวอักษร'}</p></div></ThaiNumerals>;
}
