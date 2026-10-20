'use client';
import {Children,cloneElement,isValidElement,type ReactNode,type ReactElement} from 'react';
import {toThai} from '../../lib/thai-numerals';
function localize(children:ReactNode):ReactNode{
 return Children.map(children,node=>{
  if(typeof node==='string'||typeof node==='number')return toThai(node);
  if(!isValidElement(node))return node;
  const element=node as ReactElement<Record<string,unknown>>;
  if(element.type==='script'||element.type==='style'||element.type===ThaiNumerals)return element;
  const props:Record<string,unknown>={};
  for(const key of ['placeholder','title','aria-label','alt'])if(typeof element.props[key]==='string')props[key]=toThai(element.props[key]);
  if((element.type==='input'||element.type==='textarea')&&!['hidden','password','email','url','date','checkbox','radio','file'].includes(String(element.props.type||''))){
   if(typeof element.props.value==='string')props.value=toThai(element.props.value);
   if(typeof element.props.defaultValue==='string')props.defaultValue=toThai(element.props.defaultValue);
  }
  if(element.props.children!==undefined)props.children=localize(element.props.children as ReactNode);
  return cloneElement(element,props);
 });
}
export default function ThaiNumerals({children}:{children:ReactNode}){return <>{localize(children)}</>;}
