import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MESES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default function PeriodoSelector({ periodos = [], value, onChange, onCreatePeriodo }) {
  // Extract available years from periodos
  const years = useMemo(() => {
    const ySet = new Set();
    periodos.forEach(p => {
      if (p.fecha_inicio) ySet.add(new Date(p.fecha_inicio).getFullYear());
    });
    const now = new Date(Date.now() - 5*60*60*1000);
    ySet.add(now.getFullYear());
    return [...ySet].sort((a,b) => b - a);
  }, [periodos]);

  const now = new Date(Date.now() - 5*60*60*1000);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Map periodos to months for selected year
  const monthMap = useMemo(() => {
    const map = {};
    periodos.forEach(p => {
      if (!p.fecha_inicio) return;
      const d = new Date(p.fecha_inicio);
      if (d.getFullYear() === selectedYear) {
        map[d.getMonth()] = p;
      }
    });
    return map;
  }, [periodos, selectedYear]);

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return (
    <div className="flex flex-col gap-2">
      {/* Year selector */}
      <div className="flex items-center gap-1">
        <button onClick={() => setSelectedYear(y => y - 1)} className="p-1 text-stone-400 hover:text-stone-600 rounded">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-stone-700 min-w-[3rem] text-center">{selectedYear}</span>
        <button onClick={() => setSelectedYear(y => y + 1)} disabled={selectedYear >= currentYear} className="p-1 text-stone-400 hover:text-stone-600 rounded disabled:opacity-30">
          <ChevronRight size={14} />
        </button>
      </div>
      {/* Month buttons */}
      <div className="flex flex-wrap gap-1">
        {MESES.map((mes, i) => {
          const periodo = monthMap[i];
          const isSelected = periodo && String(periodo.id) === String(value);
          const isCurrent = selectedYear === currentYear && i === currentMonth;
          const isFuture = selectedYear > currentYear || (selectedYear === currentYear && i > currentMonth);

          return (
            <button
              key={i}
              disabled={isFuture}
              onClick={() => {
                if (periodo) {
                  onChange(String(periodo.id));
                } else if (onCreatePeriodo && !isFuture) {
                  onCreatePeriodo(selectedYear, i);
                }
              }}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors duration-100 ${
                isSelected
                  ? 'bg-[var(--accent)] text-white'
                  : isCurrent && !isSelected
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300'
                  : periodo
                  ? 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  : isFuture
                  ? 'text-stone-300 cursor-not-allowed'
                  : 'text-stone-400 hover:bg-stone-50 border border-dashed border-stone-200'
              }`}
              title={periodo ? periodo.nombre : isFuture ? '' : 'Click para crear'}
            >
              {mes}
            </button>
          );
        })}
      </div>
    </div>
  );
}
