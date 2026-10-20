'use client';

import ThaiNumerals from './ThaiNumerals';
import {toArabic} from '../../lib/thai-numerals';
import { useEffect, useState, useId, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

type PaginationProps = {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
};

export default function Pagination({ page, pages, onChange, disabled = false }: PaginationProps) {
  const pageInputId=useId();
  const pageCount = Math.max(1, pages);
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const [pageInput, setPageInput] = useState(String(currentPage));

  useEffect(() => setPageInput(String(currentPage)), [currentPage]);

  function goToPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedPage = Number(toArabic(pageInput));
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > pageCount) {
      setPageInput(String(currentPage));
      return;
    }
    onChange(requestedPage);
  }

  return (
    <ThaiNumerals><div className="pagination-controls" aria-label="เลือกหน้ารายการ">
      <button className="icon-button" type="button" onClick={() => onChange(1)} disabled={disabled || currentPage <= 1} aria-label="หน้าแรก" title="หน้าแรก">
        <ChevronsLeft size={18} />
      </button>
      <button className="icon-button" type="button" onClick={() => onChange(currentPage - 1)} disabled={disabled || currentPage <= 1} aria-label="หน้าก่อนหน้า" title="หน้าก่อนหน้า">
        <ChevronLeft size={18} />
      </button>
      <span className="pagination-current">หน้า {currentPage} / {pageCount}</span>
      <form className="pagination-jump" onSubmit={goToPage}>
        <label className="sr-only" htmlFor={pageInputId}>ระบุเลขหน้าที่ต้องการ</label>
        <input
          id={pageInputId}
          className="pagination-page-input"
          type="text"
          inputMode="numeric"
          min={1}
          max={pageCount}
          step={1}
          value={pageInput}
          onChange={event => setPageInput(toArabic(event.target.value))}
          disabled={disabled}
          aria-label="ระบุเลขหน้าที่ต้องการ"
        />
        <button className="button secondary small" type="submit" disabled={disabled} title="ไปหน้าที่ระบุ">ไป</button>
      </form>
      <button className="icon-button" type="button" onClick={() => onChange(currentPage + 1)} disabled={disabled || currentPage >= pageCount} aria-label="หน้าถัดไป" title="หน้าถัดไป">
        <ChevronRight size={18} />
      </button>
      <button className="icon-button" type="button" onClick={() => onChange(pageCount)} disabled={disabled || currentPage >= pageCount} aria-label="หน้าสุดท้าย" title="หน้าสุดท้าย">
        <ChevronsRight size={18} />
      </button>
    </div></ThaiNumerals>
  );
}
