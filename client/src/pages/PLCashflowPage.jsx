import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import {
  Plus, Wallet, BarChart3, ClipboardCheck, ChevronLeft, ChevronRight,
  Trash2, Pencil, X, Save, AlertTriangle,
} from 'lucide-react';

// ── Helper components ────────────────────────────────────────

function SectionHeader({ label }) {
  return (
    <tr className="border-t border-stone-200">
      <td colSpan={99} className="px-4 py-2 text-[11px] font-bold text-stone-500 uppercase tracking-wider bg-stone-50/50">
        {label}
      </td>
    </tr>
  );
}

function SubHeader({ label }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 py-1.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wider pl-8">
        {label}
      </td>
    </tr>
  );
}

function CategoryRow({ cat, meses }) {
  return (
    <tr className={cx.tr}>
      <td className="sticky left-0 bg-white z-10 px-4 py-2.5 text-stone-700 pl-8">{cat.nombre}</td>
      {meses.map(m => {
        const val = m.por_categoria[cat.id]?.total_abs || 0;
        return (
          <td key={m.periodo.id} className={`px-4 py-2.5 text-right ${val > 0 ? (cat.tipo === 'ingreso' ? 'text-emerald-600' : 'text-stone-700') : 'text-stone-300'}`}>
            {val > 0 ? (cat.tipo === 'egreso' ? '-' : '') + formatCurrency(val) : '-'}
          </td>
        );
      })}
      <td className="px-4 py-2.5 text-right text-stone-700 bg-stone-50">
        {formatCurrency(meses.reduce((s, m) => s + (m.por_categoria[cat.id]?.total_abs || 0), 0))}
      </td>
    </tr>
  );
}

function LegacyRow({ label, tipo, meses }) {
  const hasData = meses.some(m => (m.legacy?.[tipo]?.total_abs || 0) > 0);
  if (!hasData) return null;
  return (
    <tr className={cx.tr}>
      <td className="sticky left-0 bg-white z-10 px-4 py-2.5 text-stone-400 italic pl-8">{label}</td>
      {meses.map(m => {
        const val = m.legacy?.[tipo]?.total_abs || 0;
        return (
          <td key={m.periodo.id} className="px-4 py-2.5 text-right text-stone-400 italic">
            {val > 0 ? (tipo !== 'venta' ? '-' : '') + formatCurrency(val) : '-'}
          </td>
        );
      })}
      <td className="px-4 py-2.5 text-right text-stone-400 italic bg-stone-50">
        {formatCurrency(meses.reduce((s, m) => s + (m.legacy?.[tipo]?.total_abs || 0), 0))}
      </td>
    </tr>
  );
}

function TotalRow({ label, values, color, negative }) {
  const total = values.reduce((s, v) => s + v, 0);
  const colorClass = color === 'emerald' ? 'text-emerald-600' : color === 'bold' ? '' : 'text-stone-700';
  return (
    <tr className="border-t border-stone-200">
      <td className="sticky left-0 bg-white z-10 px-4 py-2.5 font-semibold text-stone-800 pl-6">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-4 py-2.5 text-right font-semibold ${v < 0 ? 'text-rose-600' : colorClass || 'text-stone-900'}`}>
          {negative && v > 0 ? '-' : ''}{formatCurrency(Math.abs(v))}
        </td>
      ))}
      <td className={`px-4 py-2.5 text-right font-semibold bg-stone-50 ${total < 0 ? 'text-rose-600' : colorClass || 'text-stone-900'}`}>
        {formatCurrency(Math.abs(total))}
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────

export default function PLCashflowPage() {
  const api = useApi();
  const toast = useToast();

  // Tab
  const [tab, setTab] = useState('flujo');

  // Flujo de Caja
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [gridData, setGridData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Arqueo
  const [periodos, setPeriodos] = useState([]);
  const [arqueoPeriodoId, setArqueoPeriodoId] = useState('');
  const [arqueoData, setArqueoData] = useState(null);
  const [arqueoForm, setArqueoForm] = useState([]);
  const [arqueoObs, setArqueoObs] = useState('');
  const [savingArqueo, setSavingArqueo] = useState(false);

  // Cuentas
  const [cuentas, setCuentas] = useState([]);
  const [showCuentaForm, setShowCuentaForm] = useState(false);
  const [cuentaForm, setCuentaForm] = useState({ nombre: '', tipo: 'efectivo', saldo_actual: '' });
  const [editingCuentaId, setEditingCuentaId] = useState(null);
  const [savingCuenta, setSavingCuenta] = useState(false);

  // Movimiento form
  const [showMovForm, setShowMovForm] = useState(false);
  const [movForm, setMovForm] = useState({ seccion: '', flujo_categoria_id: '', cuenta_id: '', monto_absoluto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '' });
  const [categorias, setCategorias] = useState([]);
  const [savingMov, setSavingMov] = useState(false);

  // ── Data loading ─────────────────────────────────────────

  useEffect(() => {
    loadGrid();
    loadCuentas();
    loadPeriodos();
    loadCategorias();
  }, []); // eslint-disable-line

  useEffect(() => { loadGrid(); }, [anio]); // eslint-disable-line

  async function loadGrid() {
    setLoading(true);
    try {
      const res = await api.get(`/flujo/grid?anio=${anio}`);
      setGridData(res.data || res);
    } catch { toast.error('Error cargando flujo'); }
    finally { setLoading(false); }
  }

  async function loadCuentas() {
    try {
      const res = await api.get('/flujo/cuentas');
      setCuentas(res.data || res || []);
    } catch { /* silent */ }
  }

  async function loadCategorias() {
    try {
      const res = await api.get('/flujo/categorias');
      setCategorias(res.data || res || []);
    } catch { /* silent */ }
  }

  async function loadPeriodos() {
    try {
      const res = await api.get('/pl/periodos');
      const list = res.data || res || [];
      setPeriodos(Array.isArray(list) ? list.map(p => ({ value: p.id, label: p.nombre })) : []);
    } catch { /* silent */ }
  }

  async function loadArqueo(periodoId) {
    if (!periodoId) return;
    try {
      const res = await api.get(`/flujo/arqueo?periodo_id=${periodoId}`);
      const d = res.data || res;
      setArqueoData(d);
      const cuentasList = d.cuentas || cuentas || [];
      setArqueoForm(cuentasList.map(c => {
        const det = (d.detalles || []).find(dd => dd.cuenta_id === c.id);
        return {
          cuenta_id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          saldo_sistema: det?.saldo_sistema ?? c.saldo_actual ?? 0,
          saldo_real: det?.saldo_real ?? '',
        };
      }));
      setArqueoObs(d.arqueo?.observaciones || '');
    } catch { toast.error('Error cargando arqueo'); }
  }

  // ── Movimiento submit ────────────────────────────────────

  function openMovForm() {
    setMovForm({ seccion: '', flujo_categoria_id: '', cuenta_id: '', monto_absoluto: '', fecha: new Date().toISOString().slice(0, 10), descripcion: '' });
    setShowMovForm(true);
  }

  async function submitMovimiento(e) {
    e.preventDefault();
    if (!movForm.flujo_categoria_id || !movForm.monto_absoluto) {
      toast.error('Completa categoria y monto');
      return;
    }
    setSavingMov(true);
    try {
      await api.post('/flujo/movimientos', {
        flujo_categoria_id: movForm.flujo_categoria_id,
        cuenta_id: movForm.cuenta_id || null,
        fecha: movForm.fecha,
        monto_absoluto: Number(movForm.monto_absoluto),
        descripcion: movForm.descripcion,
      });
      toast.success('Movimiento registrado');
      setShowMovForm(false);
      loadGrid();
      loadCuentas();
    } catch { toast.error('Error guardando movimiento'); }
    finally { setSavingMov(false); }
  }

  // ── Arqueo submit ────────────────────────────────────────

  async function submitArqueo(cerrar = false) {
    if (!arqueoPeriodoId) return;
    if (cerrar && !window.confirm('Cerrar el mes? Esto actualizara los saldos de las cuentas y propagara al siguiente periodo.')) return;
    setSavingArqueo(true);
    try {
      await api.post('/flujo/arqueo', {
        periodo_id: arqueoPeriodoId,
        detalles: arqueoForm.map(f => ({
          cuenta_id: f.cuenta_id,
          saldo_sistema: Number(f.saldo_sistema) || 0,
          saldo_real: Number(f.saldo_real) || 0,
        })),
        observaciones: arqueoObs,
        cerrar,
      });
      toast.success(cerrar ? 'Mes cerrado correctamente' : 'Arqueo guardado');
      loadArqueo(arqueoPeriodoId);
      if (cerrar) { loadGrid(); loadCuentas(); }
    } catch { toast.error('Error guardando arqueo'); }
    finally { setSavingArqueo(false); }
  }

  // ── Cuentas CRUD ─────────────────────────────────────────

  async function submitCuenta(e) {
    e.preventDefault();
    if (!cuentaForm.nombre) { toast.error('Nombre requerido'); return; }
    setSavingCuenta(true);
    try {
      if (editingCuentaId) {
        await api.put(`/flujo/cuentas/${editingCuentaId}`, cuentaForm);
        toast.success('Cuenta actualizada');
      } else {
        await api.post('/flujo/cuentas', {
          nombre: cuentaForm.nombre,
          tipo: cuentaForm.tipo,
          saldo_actual: Number(cuentaForm.saldo_actual) || 0,
        });
        toast.success('Cuenta creada');
      }
      setShowCuentaForm(false);
      setEditingCuentaId(null);
      setCuentaForm({ nombre: '', tipo: 'efectivo', saldo_actual: '' });
      loadCuentas();
    } catch { toast.error('Error guardando cuenta'); }
    finally { setSavingCuenta(false); }
  }

  async function deleteCuenta(id) {
    if (!window.confirm('Eliminar esta cuenta?')) return;
    try {
      await api.delete(`/flujo/cuentas/${id}`);
      toast.success('Cuenta eliminada');
      loadCuentas();
    } catch { toast.error('Error eliminando cuenta'); }
  }

  function editCuenta(c) {
    setCuentaForm({ nombre: c.nombre, tipo: c.tipo, saldo_actual: c.saldo_actual || '' });
    setEditingCuentaId(c.id);
    setShowCuentaForm(true);
  }

  // ── Derived data ─────────────────────────────────────────

  const meses = gridData?.meses || [];
  const gridCategorias = gridData?.categorias || [];

  const seccionOpts = [
    { value: 'operativo', label: 'Operativo' },
    { value: 'inversion', label: 'Inversion' },
    { value: 'financiamiento', label: 'Financiamiento' },
  ];

  const filteredCatOpts = categorias
    .filter(c => !movForm.seccion || c.seccion === movForm.seccion)
    .map(c => ({ value: c.id, label: `${c.nombre} (${c.tipo})` }));

  const cuentaOpts = cuentas.map(c => ({ value: c.id, label: c.nombre }));

  const tipoBadge = (tipo) => {
    if (tipo === 'efectivo') return cx.badge('bg-emerald-50 text-emerald-700');
    if (tipo === 'banco') return cx.badge('bg-sky-50 text-sky-700');
    return cx.badge('bg-violet-50 text-violet-700');
  };

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto">
      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-fit mb-6">
        {[
          { key: 'flujo', label: 'Flujo de Caja', icon: BarChart3 },
          { key: 'arqueo', label: 'Arqueo', icon: ClipboardCheck },
          { key: 'cuentas', label: 'Cuentas', icon: Wallet },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === 'arqueo' && arqueoPeriodoId) loadArqueo(arqueoPeriodoId); }}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              tab === t.key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ TAB 1: FLUJO DE CAJA ═══════════════════ */}
      {tab === 'flujo' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Flujo de Caja</h1>
              <p className="text-sm text-stone-500 mt-0.5">Estado de flujo de efectivo</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <button onClick={() => setAnio(a => a - 1)} className={cx.btnGhost}><ChevronLeft size={16} /></button>
                <span className="text-sm font-bold text-stone-800 w-12 text-center">{anio}</span>
                <button onClick={() => setAnio(a => a + 1)} className={cx.btnGhost}><ChevronRight size={16} /></button>
              </div>
              <button onClick={() => openMovForm()} className={cx.btnPrimary + ' flex items-center gap-2'}>
                <Plus size={16} /> Movimiento
              </button>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <div key={i} className={cx.skeleton + ' h-24'} />)}
            </div>
          ) : meses.length === 0 ? (
            <div className={cx.card + ' p-12 text-center'}>
              <BarChart3 size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-500">No hay datos para {anio}</p>
            </div>
          ) : (
            <div className={cx.card + ' overflow-hidden'}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="sticky left-0 bg-white z-10 px-4 py-3 text-left text-stone-400 text-[11px] font-semibold uppercase tracking-wider min-w-[200px]">Concepto</th>
                      {meses.map(m => (
                        <th key={m.periodo.id} className="px-4 py-3 text-right text-stone-400 text-[11px] font-semibold uppercase tracking-wider min-w-[120px]">
                          {m.periodo.nombre}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right text-stone-400 text-[11px] font-semibold uppercase tracking-wider min-w-[120px] bg-stone-50">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* SALDO INICIAL */}
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <td className="sticky left-0 bg-stone-50 z-10 px-4 py-3 font-bold text-stone-900">SALDO INICIAL</td>
                      {meses.map(m => (
                        <td key={m.periodo.id} className="px-4 py-3 text-right font-bold text-stone-900">
                          {formatCurrency(m.saldo_inicial)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-stone-900 bg-stone-100">
                        {meses.length > 0 ? formatCurrency(meses[0].saldo_inicial) : '-'}
                      </td>
                    </tr>

                    {/* I. ACTIVIDADES OPERATIVAS */}
                    <SectionHeader label="I. ACTIVIDADES OPERATIVAS" />
                    <SubHeader label="Ingresos" />
                    {gridCategorias.filter(c => c.seccion === 'operativo' && c.tipo === 'ingreso').map(cat => (
                      <CategoryRow key={cat.id} cat={cat} meses={meses} />
                    ))}
                    <LegacyRow label="Ventas (sin clasificar)" tipo="venta" meses={meses} />
                    <TotalRow label="TOTAL INGRESOS" values={meses.map(m => m.totales?.ingresos_operativos || 0)} color="emerald" />

                    <SubHeader label="Egresos" />
                    {gridCategorias.filter(c => c.seccion === 'operativo' && c.tipo === 'egreso').map(cat => (
                      <CategoryRow key={cat.id} cat={cat} meses={meses} />
                    ))}
                    <LegacyRow label="Gastos (sin clasificar)" tipo="gasto" meses={meses} />
                    <LegacyRow label="Compras (sin clasificar)" tipo="compra" meses={meses} />
                    <TotalRow label="TOTAL EGRESOS" values={meses.map(m => m.totales?.egresos_operativos || 0)} color="stone" negative />
                    <TotalRow label="FLUJO NETO OPERATIVO" values={meses.map(m => m.totales?.flujo_operativo || 0)} color="bold" />

                    {/* II. ACTIVIDADES DE INVERSION */}
                    <SectionHeader label="II. ACTIVIDADES DE INVERSION" />
                    {gridCategorias.filter(c => c.seccion === 'inversion').map(cat => (
                      <CategoryRow key={cat.id} cat={cat} meses={meses} />
                    ))}
                    <TotalRow label="FLUJO NETO INVERSION" values={meses.map(m => m.totales?.flujo_inversion || 0)} color="bold" />

                    {/* III. ACTIVIDADES DE FINANCIAMIENTO */}
                    <SectionHeader label="III. ACTIVIDADES DE FINANCIAMIENTO" />
                    {gridCategorias.filter(c => c.seccion === 'financiamiento').map(cat => (
                      <CategoryRow key={cat.id} cat={cat} meses={meses} />
                    ))}
                    <TotalRow label="FLUJO NETO FINANCIAMIENTO" values={meses.map(m => m.totales?.flujo_financiamiento || 0)} color="bold" />

                    {/* FLUJO NETO DEL PERIODO */}
                    <tr className="border-t-2 border-stone-300 bg-stone-50">
                      <td className="sticky left-0 bg-stone-50 z-10 px-4 py-3 font-bold text-stone-900">FLUJO NETO DEL PERIODO</td>
                      {meses.map(m => (
                        <td key={m.periodo.id} className={`px-4 py-3 text-right font-bold ${(m.totales?.flujo_neto || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(m.totales?.flujo_neto || 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-stone-900 bg-stone-100">
                        {formatCurrency(meses.reduce((s, m) => s + (m.totales?.flujo_neto || 0), 0))}
                      </td>
                    </tr>

                    {/* SALDO FINAL */}
                    <tr className="bg-stone-100 border-t border-stone-300">
                      <td className="sticky left-0 bg-stone-100 z-10 px-4 py-3 font-bold text-stone-900">SALDO FINAL</td>
                      {meses.map(m => (
                        <td key={m.periodo.id} className={`px-4 py-3 text-right font-bold text-lg ${(m.saldo_final || 0) >= 0 ? 'text-stone-900' : 'text-rose-600'}`}>
                          {formatCurrency(m.saldo_final)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-lg text-stone-900 bg-stone-200">
                        {meses.length > 0 ? formatCurrency(meses[meses.length - 1].saldo_final) : '-'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ TAB 2: ARQUEO ═══════════════════ */}
      {tab === 'arqueo' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Arqueo de Caja</h1>
              <p className="text-sm text-stone-500 mt-0.5">Conciliacion de saldos por periodo</p>
            </div>
            <div className="w-52">
              <CustomSelect
                options={periodos}
                value={arqueoPeriodoId}
                onChange={(v) => { setArqueoPeriodoId(v); loadArqueo(v); }}
                placeholder="Periodo..."
              />
            </div>
          </div>

          {!arqueoPeriodoId ? (
            <div className={cx.card + ' p-12 text-center'}>
              <ClipboardCheck size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-500">Selecciona un periodo para comenzar el arqueo</p>
            </div>
          ) : arqueoForm.length === 0 ? (
            <div className={cx.card + ' p-12 text-center'}>
              <p className="text-sm text-stone-500">No hay cuentas registradas. Crea cuentas en la pestana "Cuentas".</p>
            </div>
          ) : (
            <div className={cx.card + ' overflow-hidden'}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className={cx.th}>Cuenta</th>
                      <th className={cx.th}>Tipo</th>
                      <th className={cx.th + ' text-right'}>Saldo Sistema</th>
                      <th className={cx.th + ' text-right'}>Saldo Real</th>
                      <th className={cx.th + ' text-right'}>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arqueoForm.map((row, idx) => {
                      const diff = (Number(row.saldo_real) || 0) - Number(row.saldo_sistema);
                      const hasReal = row.saldo_real !== '';
                      return (
                        <tr key={row.cuenta_id} className={cx.tr}>
                          <td className={cx.td + ' font-medium text-stone-800'}>{row.nombre}</td>
                          <td className={cx.td}><span className={tipoBadge(row.tipo)}>{row.tipo}</span></td>
                          <td className={cx.td + ' text-right font-mono text-stone-600'}>{formatCurrency(row.saldo_sistema)}</td>
                          <td className={cx.td + ' text-right'}>
                            <input
                              type="number"
                              step="0.01"
                              value={row.saldo_real}
                              onChange={(e) => {
                                const next = [...arqueoForm];
                                next[idx] = { ...next[idx], saldo_real: e.target.value };
                                setArqueoForm(next);
                              }}
                              className={cx.input + ' max-w-[140px] ml-auto text-right'}
                              placeholder="0.00"
                            />
                          </td>
                          <td className={cx.td + ' text-right font-semibold'}>
                            {hasReal ? (
                              <span className={diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-sky-600' : 'text-rose-600'}>
                                {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                              </span>
                            ) : (
                              <span className="text-stone-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals */}
                    <tr className="border-t-2 border-stone-300 bg-stone-50">
                      <td className={cx.td + ' font-bold text-stone-900'} colSpan={2}>TOTAL</td>
                      <td className={cx.td + ' text-right font-bold text-stone-900'}>
                        {formatCurrency(arqueoForm.reduce((s, r) => s + Number(r.saldo_sistema), 0))}
                      </td>
                      <td className={cx.td + ' text-right font-bold text-stone-900'}>
                        {formatCurrency(arqueoForm.reduce((s, r) => s + (Number(r.saldo_real) || 0), 0))}
                      </td>
                      <td className={cx.td + ' text-right font-bold'}>
                        {(() => {
                          const totalDiff = arqueoForm.reduce((s, r) => s + ((Number(r.saldo_real) || 0) - Number(r.saldo_sistema)), 0);
                          return (
                            <span className={totalDiff === 0 ? 'text-emerald-600' : totalDiff > 0 ? 'text-sky-600' : 'text-rose-600'}>
                              {totalDiff > 0 ? '+' : ''}{formatCurrency(totalDiff)}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Observaciones + buttons */}
              <div className="p-4 border-t border-stone-200 space-y-4">
                <div>
                  <label className={cx.label}>Observaciones</label>
                  <textarea
                    value={arqueoObs}
                    onChange={e => setArqueoObs(e.target.value)}
                    className={cx.input + ' min-h-[80px]'}
                    placeholder="Notas sobre el arqueo..."
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => submitArqueo(false)}
                    disabled={savingArqueo}
                    className={cx.btnSecondary + ' flex items-center gap-2'}
                  >
                    <Save size={14} /> {savingArqueo ? 'Guardando...' : 'Guardar Arqueo'}
                  </button>
                  <button
                    onClick={() => submitArqueo(true)}
                    disabled={savingArqueo}
                    className={cx.btnPrimary + ' flex items-center gap-2'}
                  >
                    <ClipboardCheck size={14} /> Cerrar Mes
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ TAB 3: CUENTAS ═══════════════════ */}
      {tab === 'cuentas' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900">Cuentas / Billeteras</h1>
              <p className="text-sm text-stone-500 mt-0.5">Gestiona tus cuentas de efectivo, banco y digital</p>
            </div>
            <button
              onClick={() => { setCuentaForm({ nombre: '', tipo: 'efectivo', saldo_actual: '' }); setEditingCuentaId(null); setShowCuentaForm(true); }}
              className={cx.btnPrimary + ' flex items-center gap-2'}
            >
              <Plus size={16} /> Cuenta
            </button>
          </div>

          {/* Inline form */}
          {showCuentaForm && (
            <div className={cx.card + ' p-5 mb-4'}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-stone-900">{editingCuentaId ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
                <button onClick={() => { setShowCuentaForm(false); setEditingCuentaId(null); }} className={cx.btnGhost}><X size={16} /></button>
              </div>
              <form onSubmit={submitCuenta} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                <div>
                  <label className={cx.label}>Nombre</label>
                  <input
                    type="text"
                    value={cuentaForm.nombre}
                    onChange={e => setCuentaForm(f => ({ ...f, nombre: e.target.value }))}
                    className={cx.input}
                    placeholder="Ej: Caja chica"
                  />
                </div>
                <div>
                  <label className={cx.label}>Tipo</label>
                  <CustomSelect
                    options={[
                      { value: 'efectivo', label: 'Efectivo' },
                      { value: 'banco', label: 'Banco' },
                      { value: 'digital', label: 'Digital' },
                    ]}
                    value={cuentaForm.tipo}
                    onChange={v => setCuentaForm(f => ({ ...f, tipo: v }))}
                  />
                </div>
                <div>
                  <label className={cx.label}>Saldo actual</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cuentaForm.saldo_actual}
                    onChange={e => setCuentaForm(f => ({ ...f, saldo_actual: e.target.value }))}
                    className={cx.input}
                    placeholder="0.00"
                  />
                </div>
                <button type="submit" disabled={savingCuenta} className={cx.btnPrimary}>
                  {savingCuenta ? 'Guardando...' : editingCuentaId ? 'Actualizar' : 'Crear'}
                </button>
              </form>
            </div>
          )}

          {/* Cuentas table */}
          {cuentas.length === 0 ? (
            <div className={cx.card + ' p-12 text-center'}>
              <Wallet size={32} className="mx-auto text-stone-300 mb-3" />
              <p className="text-sm text-stone-500">No hay cuentas registradas</p>
            </div>
          ) : (
            <div className={cx.card + ' overflow-hidden'}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className={cx.th}>Nombre</th>
                    <th className={cx.th}>Tipo</th>
                    <th className={cx.th + ' text-right'}>Saldo Actual</th>
                    <th className={cx.th + ' text-right'}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentas.map(c => (
                    <tr key={c.id} className={cx.tr}>
                      <td className={cx.td + ' font-medium text-stone-800'}>{c.nombre}</td>
                      <td className={cx.td}><span className={tipoBadge(c.tipo)}>{c.tipo}</span></td>
                      <td className={cx.td + ' text-right font-semibold ' + ((c.saldo_actual || 0) >= 0 ? 'text-stone-900' : 'text-rose-600')}>
                        {formatCurrency(c.saldo_actual || 0)}
                      </td>
                      <td className={cx.td + ' text-right'}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => editCuenta(c)} className={cx.btnGhost} title="Editar"><Pencil size={14} /></button>
                          <button onClick={() => deleteCuenta(c.id)} className={cx.btnDanger} title="Eliminar"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════ MODAL: MOVIMIENTO ═══════════════════ */}
      {showMovForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMovForm(false)}>
          <div className={cx.card + ' w-full max-w-lg mx-4 p-6'} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-stone-900">Nuevo Movimiento</h2>
              <button onClick={() => setShowMovForm(false)} className={cx.btnGhost}><X size={18} /></button>
            </div>
            <form onSubmit={submitMovimiento} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={cx.label}>Seccion</label>
                  <CustomSelect
                    options={seccionOpts}
                    value={movForm.seccion}
                    onChange={v => setMovForm(f => ({ ...f, seccion: v, flujo_categoria_id: '' }))}
                    placeholder="Seccion..."
                  />
                </div>
                <div>
                  <label className={cx.label}>Categoria</label>
                  <CustomSelect
                    options={filteredCatOpts}
                    value={movForm.flujo_categoria_id}
                    onChange={v => setMovForm(f => ({ ...f, flujo_categoria_id: v }))}
                    placeholder="Categoria..."
                  />
                </div>
              </div>
              <div>
                <label className={cx.label}>Cuenta (opcional)</label>
                <CustomSelect
                  options={cuentaOpts}
                  value={movForm.cuenta_id}
                  onChange={v => setMovForm(f => ({ ...f, cuenta_id: v }))}
                  placeholder="Sin cuenta especifica..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={cx.label}>Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={movForm.monto_absoluto}
                    onChange={e => setMovForm(f => ({ ...f, monto_absoluto: e.target.value }))}
                    className={cx.input}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={cx.label}>Fecha</label>
                  <input
                    type="date"
                    value={movForm.fecha}
                    onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))}
                    className={cx.input}
                  />
                </div>
              </div>
              <div>
                <label className={cx.label}>Descripcion</label>
                <input
                  type="text"
                  value={movForm.descripcion}
                  onChange={e => setMovForm(f => ({ ...f, descripcion: e.target.value }))}
                  className={cx.input}
                  placeholder="Descripcion del movimiento..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowMovForm(false)} className={cx.btnSecondary}>Cancelar</button>
                <button type="submit" disabled={savingMov} className={cx.btnPrimary + ' flex items-center gap-2'}>
                  {savingMov ? 'Guardando...' : <><Save size={14} /> Registrar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
