'use client';
import {useEffect} from 'react';
export default function Maintenance(){
 useEffect(()=>{const controller=new AbortController();let stopped=false,inFlight=false;
  async function run(){if(inFlight)return;inFlight=true;try{for(const step of ['region','age','vassa','statistics']){if(stopped)return;try{await fetch('/api/maintenance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({step}),signal:controller.signal});}catch{return;}}}finally{inFlight=false;}}
  void run();const timer=setInterval(()=>void run(),180000);
  return ()=>{stopped=true;clearInterval(timer);controller.abort();};
 },[]);
 return null;
}
