'use client';
import ThaiNumerals from './ThaiNumerals';
import {PAGE_SIZES} from '../../lib/pagination';
export default function PageSizeSelect({value,onChange,disabled=false,sizes=PAGE_SIZES}:{value:number;onChange:(size:number)=>void;disabled?:boolean;sizes?:readonly number[]}){
 return <ThaiNumerals><label className="page-size-select"><span>แสดงครั้งละ</span><select aria-label="จำนวนรายการต่อหน้า" value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}>{sizes.map(size=><option key={size} value={size}>{size}</option>)}</select><span>รายการ</span></label></ThaiNumerals>;
}
