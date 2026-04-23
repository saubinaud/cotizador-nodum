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
        <span className={selected ? 'text-white' : 'text-zinc-600'}>
          {selected ? selected[displayKey] : placeholder}
        </span>
        <ChevronDown size={14} className="text-zinc-500" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-[#FA7B21]"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-zinc-500">Sin resultados</div>
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
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-700 transition-colors ${
                    o[valueKey] === value ? 'text-[#FA7B21]' : 'text-white'
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
