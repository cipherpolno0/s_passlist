import {toArabic} from './thai-numerals';
export const PAGE_SIZES=[25,50,100] as const;
export const ADMIN_RECORD_PAGE_SIZES=[25,50,100,250,500,1000] as const;
export function pagination(total:number,params:URLSearchParams,allowedSizes:readonly number[]=PAGE_SIZES){
 const requestedSize=Number(toArabic(params.get('pageSize')));
 const pageSize=allowedSizes.includes(requestedSize)?requestedSize:(allowedSizes[0]||25);
 const pages=Math.ceil(total/pageSize);
 const requestedPage=Math.floor(Number(toArabic(params.get('page'))));
 const page=Math.max(1,Math.min(pages||1,Number.isFinite(requestedPage)?requestedPage||1:1));
 return {pageSize,pages,page,offset:(page-1)*pageSize};
}
