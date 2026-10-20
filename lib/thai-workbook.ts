import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {toThai} from './thai-numerals';
import {checkZip} from './excel';
const decode=(text:string)=>text.replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(_,code:string,name:string)=>code?String.fromCodePoint(code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name.toLowerCase()]||''));
const encode=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const thaiText=(text:string)=>encode(toThai(decode(text)));
// A downloadable value snapshot. Preserve the retained source and OOXML coordinates/indexes.
export function thaiWorkbookCopy(bytes:Uint8Array){
 checkZip(bytes);const archive=unzipSync(bytes);
 for(const path of Object.keys(archive)){
  if(!/^xl\/(?:worksheets\/[^/]+|sharedStrings|comments\d*)\.xml$/.test(path))continue;
  let xml=strFromU8(archive[path]);
  if(path.startsWith('xl/worksheets/'))xml=xml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g,(cell:string,attributes:string,body:string)=>{
   const type=attributes.match(/\bt=["']([^"']+)["']/)?.[1]||'n';if(type==='s'||type==='inlineStr'||type==='b'||type==='e')return cell;
   const value=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];if(value===undefined)return cell;
   if(type==='n'&&!/^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?$/.test(value.trim()))return cell;
   const attrs=attributes.replace(/\s+t=["'][^"']*["']/,'');
   return `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${thaiText(value)}</t></is></c>`;
  });
  xml=xml.replace(/<t(\s[^>]*)?>([\s\S]*?)<\/t>/g,(_:string,attrs:string|undefined,text:string)=>`<t${attrs||''}>${thaiText(text)}</t>`);
  xml=xml.replace(/<(oddHeader|oddFooter|evenHeader|evenFooter|firstHeader|firstFooter)>([\s\S]*?)<\/\1>/g,(_:string,tag:string,text:string)=>`<${tag}>${thaiText(text)}</${tag}>`);
  archive[path]=strToU8(xml);
 }
 return zipSync(archive,{level:6});
}
