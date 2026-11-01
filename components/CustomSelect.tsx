'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  label: string;
  value: string;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function CustomSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  const toggleOpen = () => {
    if (disabled) return;
    if (!open && containerRef.current && typeof window !== 'undefined') {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 240 && rect.top > 240);
    }
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-semibold rounded-xl border transition-all cursor-pointer text-left ${
          open
            ? 'border-[#C86D2D] ring-2 ring-[#C86D2D]/25 bg-white dark:bg-[#1E1E22] text-zinc-900 dark:text-zinc-100'
            : 'border-[#D5CEC4] dark:border-[#2E2E36] bg-[#F8F5F0] dark:bg-[#18181B] hover:border-[#C86D2D]/80 dark:hover:border-[#DF7B35]/80 text-zinc-900 dark:text-zinc-100'
        } disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className="truncate">{selectedOption?.label || value}</span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-[#C86D2D]' : ''
          }`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute z-50 w-full max-h-64 overflow-y-auto rounded-xl border border-[#D5CEC4] dark:border-[#32323B] bg-[#FAF7F2] dark:bg-[#1C1C22] p-1.5 shadow-2xl space-y-0.5 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer text-left ${
                    isSelected
                      ? 'bg-[#C86D2D] text-white font-semibold'
                      : 'text-zinc-800 dark:text-zinc-200 hover:bg-[#C86D2D]/15 dark:hover:bg-white/10 hover:text-[#C86D2D] dark:hover:text-[#DF7B35]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 shrink-0 text-white" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
