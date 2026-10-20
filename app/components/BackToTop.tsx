'use client';
import {useEffect,useState} from 'react';
import {ArrowUp} from 'lucide-react';
export default function BackToTop(){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{const update=()=>setVisible(window.scrollY>400);update();window.addEventListener('scroll',update,{passive:true});return()=>window.removeEventListener('scroll',update);},[]);
 if(!visible)return null;
 return <button type="button" className="back-to-top" aria-label="กลับขึ้นด้านบน" title="กลับขึ้นด้านบน" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}><ArrowUp size={19}/><span>กลับขึ้นด้านบน</span></button>;
}
