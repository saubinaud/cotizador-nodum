import { useState, useRef, useEffect } from 'react';
import { cx } from '../styles/tokens';
import { ChevronDown } from 'lucide-react';

export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Buscar...', displayKey = 'nombre', valueKey = 'id' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter((o) =>
    (o[displayKey] || '').toLowerCase().includes(search.toLowerCase())
  );

  const selected = options.find((o) => o[valueKey] === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${cx.input} text-left flex items-center justify-between`}
      >
        <span className={selected ? 'text-stone-800' : 'text-stone-400'}>
          {selected ? selected[displayKey] : placeholder}
        </span>
        <ChevronDown size={14} className="text-stone-400" />
      </button>

      {open && (
        <div className="absolute z-[60] mt-2 left-0 w-full min-w-0 bg-white border border-stone-100 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 text-sm placeholder:text-stone-400 focus:outline-none focus:border-[var(--accent)]"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-stone-400">Sin resultados</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o[valueKey]}
                  type="button"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-100 transition-colors ${
                    o[valueKey] === value ? 'text-[var(--accent)]' : 'text-stone-800'
                  }`}
                >
                  {o[displayKey]}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
