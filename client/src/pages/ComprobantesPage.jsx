import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  FileText, Receipt, Eye, Ban, DollarSign,
} from 'lucide-react';

const TIPO_DOC_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: '01', label: 'Factura' },
  { value: '03', label: 'Boleta' },
];

const TIPO_LABELS = { '01': 'Factura', '03': 'Boleta' };

function estadoBadge(estado) {
  switch (estado) {
    case 'emitido': return cx.badge('bg-emerald-50 text-emerald-600');
    case 'anulado': return cx.badge('bg-stone-100 text-stone-500');
    case 'error': return cx.badge('bg-rose-50 text-rose-600');
    default: return cx.badge('bg-stone-100 text-stone-500');
  }
}

export default function ComprobantesPage() {
  const api = useApi();
  const toast = useToast();

  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [tipoFilter, setTipoFilter] = useState('');
  const [anularTarget, setAnularTarget] = useState(null);

  // Load periodos on mount
  useEffect(() => {
    api.get('/pl/periodos').then(res => {
      const pers = res.data || res || [];
      setPeriodos(pers.map(p => ({ value: String(p.id), label: p.nombre })));
      if (pers.length > 0) setPeriodoId(String(pers[0].id));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []); // eslint-disable-line

  // Load comprobantes when periodo or filter changes
  const loadComprobantes = async () => {
    if (!periodoId) return;
    setLoadingData(true);
    try {
      let path = `/facturacion/comprobantes?periodo_id=${periodoId}`;
      if (tipoFilter) path += `&tipo_doc=${tipoFilter}`;
      const res = await api.get(path);
      setComprobantes(res.data || res || []);
    } catch {
      toast.error('Error cargando comprobantes');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (periodoId) loadComprobantes();
  }, [periodoId, tipoFilter]); // eslint-disable-line

  // Summary
  const summary = useMemo(() => {
    let total = 0, facturas = 0, boletas = 0;
    comprobantes.forEach(c => {
      if (c.estado !== 'anulado') {
        total += parseFloat(c.total) || 0;
        if (c.tipo_doc === '01') facturas++;
        if (c.tipo_doc === '03') boletas++;
      }
    });
    return { total, facturas, boletas };
  }, [comprobantes]);

  // View PDF
  const viewPdf = async (id) => {
    try {
      const res = await api.get(`/facturacion/pdf/${id}`);
      const data = res.data || res;
      if (!data.pdf) {
        toast.error('PDF no disponible');
        return;
      }
      const byteChars = atob(data.pdf);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      toast.error(err.message || 'Error obteniendo PDF');
    }
  };

  // Anular
  const handleAnular = async () => {
    if (!anularTarget) return;
    try {
      await api.post(`/facturacion/anular/${anularTarget.id}`);
      toast.success('Comprobante anulado');
      loadComprobantes();
    } catch (err) {
      toast.error(err.message || 'Error anulando');
    } finally {
      setAnularTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto pb-12 space-y-4">
        <div className={cx.skeleton + ' h-10 w-48'} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-24'} />)}
        </div>
        <div className={cx.skeleton + ' h-64'} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <FileText size={22} className="text-[var(--accent)]" />
          <h1 className="text-xl font-bold text-stone-900">Comprobantes</h1>
        </div>
        <div className="flex items-center gap-3">
          {periodos.length > 0 && (
            <CustomSelect
              value={periodoId}
              onChange={setPeriodoId}
              options={periodos}
              placeholder="Periodo"
              className="w-48"
            />
          )}
          <CustomSelect
            value={tipoFilter}
            onChange={setTipoFilter}
            options={TIPO_DOC_OPTIONS}
            placeholder="Tipo"
            className="w-36"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <div className={`${cx.card} p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={18} className="text-[var(--accent)]" />
            <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">Total emitido</span>
          </div>
          <p className="text-xl font-bold text-stone-900">{formatCurrency(summary.total)}</p>
        </div>
        <div className={`${cx.card} p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <FileText size={18} className="text-stone-400" />
            <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">Facturas</span>
          </div>
          <p className="text-xl font-bold text-stone-900">{summary.facturas}</p>
        </div>
        <div className={`${cx.card} p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Receipt size={18} className="text-stone-400" />
            <span className="text-xs font-semibold text-stone-500 tracking-wide uppercase">Boletas</span>
          </div>
          <p className="text-xl font-bold text-stone-900">{summary.boletas}</p>
        </div>
      </div>

      {/* Table */}
      {loadingData ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-16'} />)}
        </div>
      ) : comprobantes.length === 0 ? (
        <div className={`${cx.card} p-12 text-center`}>
          <FileText size={40} className="text-stone-300 mx-auto mb-4" />
          <p className="text-stone-400 text-sm">No hay comprobantes en este periodo</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className={`${cx.card} hidden lg:block overflow-hidden`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className={cx.th}>Serie-Correlativo</th>
                  <th className={cx.th}>Tipo</th>
                  <th className={cx.th}>Cliente</th>
                  <th className={cx.th + ' text-right'}>Total</th>
                  <th className={cx.th}>Estado</th>
                  <th className={cx.th}>Fecha</th>
                  <th className={cx.th + ' w-28'}></th>
                </tr>
              </thead>
              <tbody>
                {comprobantes.map((c) => (
                  <tr key={c.id} className={cx.tr}>
                    <td className={cx.td + ' font-mono text-sm font-medium text-stone-900'}>
                      {c.serie}-{c.correlativo}
                    </td>
                    <td className={cx.td + ' text-stone-600'}>{TIPO_LABELS[c.tipo_doc] || c.tipo_doc}</td>
                    <td className={cx.td + ' text-stone-600 text-xs'}>{c.cliente_razon_social || c.razon_social || '-'}</td>
                    <td className={cx.td + ' text-right font-semibold text-stone-900'}>{formatCurrency(c.total)}</td>
                    <td className={cx.td}>
                      <span className={estadoBadge(c.estado)}>{c.estado}</span>
                    </td>
                    <td className={cx.td + ' text-stone-500'}>{formatDate(c.fecha_emision || c.created_at)}</td>
                    <td className={cx.td}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => viewPdf(c.id)} className={cx.btnIcon} title="Ver PDF">
                          <Eye size={14} />
                        </button>
                        {c.estado === 'emitido' && (
                          <button onClick={() => setAnularTarget(c)} className={cx.btnIcon + ' hover:text-rose-600'} title="Anular">
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {comprobantes.map((c) => (
              <div key={c.id} className={cx.card + ' p-4'}>
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 font-mono">
                      {c.serie}-{c.correlativo}
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      {TIPO_LABELS[c.tipo_doc] || c.tipo_doc} &middot; {formatDate(c.fecha_emision || c.created_at)}
                    </p>
                  </div>
                  <span className={estadoBadge(c.estado)}>{c.estado}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <p className="text-xs text-stone-500 truncate">{c.cliente_razon_social || c.razon_social || '-'}</p>
                    <p className="text-sm font-semibold text-stone-900 mt-0.5">{formatCurrency(c.total)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => viewPdf(c.id)} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                      <Eye size={12} /> PDF
                    </button>
                    {c.estado === 'emitido' && (
                      <button onClick={() => setAnularTarget(c)} className={cx.btnDanger + ' text-xs flex items-center gap-1'}>
                        <Ban size={12} /> Anular
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Confirm anular */}
      <ConfirmDialog
        open={!!anularTarget}
        title="Anular comprobante"
        message={`Estas seguro de anular el comprobante ${anularTarget?.serie}-${anularTarget?.correlativo}?`}
        onConfirm={handleAnular}
        onCancel={() => setAnularTarget(null)}
      />
    </div>
  );
}
