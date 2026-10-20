import type { Metadata } from 'next';
import './globals.css';
import BackToTop from './components/BackToTop';
export const metadata:Metadata={title:'ธรรมทะเบียน · สืบค้นผู้สอบได้',description:'ระบบสืบค้นรายชื่อผู้สอบได้นักธรรมและธรรมศึกษา นำเข้า Excel ทุกภาค ทุกจังหวัด ทุกชั้น ทั้งมหานิกายและธรรมยุต แยกปี พ.ศ.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}<BackToTop/></body></html>}
