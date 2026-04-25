import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomSelect({ options = [], value, onChange, placeholder = 'Seleccionar...', className = '', compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-white border border-stone-300 rounded-lg text-stone-800 text-left flex items-center justify-between focus:outline-none focus:border-stone-500 transition-colors duration-150 ${
          compact ? 'px-2 py-1.5 text-xs gap-1' : 'px-4 py-2.5 text-sm gap-2'
        }`}
      >
        <span className={selected ? 'text-stone-800 truncate' : 'text-stone-400 truncate'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={compact ? 12 : 14} className={`text-stone-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={`absolute z-50 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden ${compact ? 'min-w-[80px]' : 'w-full'}`}>
          <div className="max-h-48 overflow-y-auto py-1">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 hover:bg-stone-50 transition-colors ${
                  compact ? 'py-1.5 text-xs' : 'py-2 text-sm'
                } ${o.value === value ? 'text-[var(--accent)] font-medium bg-[var(--accent-light)]' : 'text-stone-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
