import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import {
  ArrowLeft, Pencil, Save, X, Printer, Clock, DollarSign,
  AlertTriangle, ChevronDown, ChevronUp, Package
} from 'lucide-react';
import { useTerminos } from '../context/TerminosContext';

export default function FichaTecnicaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const toast = useToast();
  const { user } = useAuth();
  const tm = useTerminos();
  const simbolo = user?.simbolo || 'S/';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    loadFicha();
  }, [id]);

  const loadFicha = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/productos/${id}/ficha-tecnica`);
      setData(res.data);
    } catch (err) {
      toast.error('Error cargando ficha tecnica');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = () => {
    if (!data) return;
    const p = data.producto;
    const c = data.calculos;
    setEditForm({
      tiempo_activo_min: p.tiempo_activo_min ?? '',
      tiempo_horno_min: p.tiempo_horno_min ?? '',
      tarifa_mo_override: p.tarifa_mo_override ?? '',
      margen_minimo_override: p.margen_minimo_override ?? '',
      cif_gas_unitario: p.cif_gas_unitario ?? '',
      cif_overhead_unitario: p.cif_overhead_unitario ?? '',
      instrucciones_ensamble: p.instrucciones_ensamble || '',
      instrucciones_prep: data.preparaciones.map(pr => ({
        prep_id: pr.id,
        instrucciones: pr.instrucciones || '',
      })),
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/productos/${id}/ficha-tecnica`, {
        tiempo_activo_min: editForm.tiempo_activo_min || null,
        tiempo_horno_min: editForm.tiempo_horno_min || null,
        tarifa_mo_override: editForm.tarifa_mo_override || null,
        margen_minimo_override: editForm.margen_minimo_override || null,
        cif_gas_unitario: editForm.cif_gas_unitario || null,
        cif_overhead_unitario: editForm.cif_overhead_unitario || null,
        instrucciones_ensamble: editForm.instrucciones_ensamble,
        instrucciones_prep: editForm.instrucciones_prep,
      });
      toast.success('Ficha actualizada');
      setEditing(false);
      loadFicha();
    } catch (err) {
      toast.error(err.message || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  const ef = (field, value) => setEditForm(f => ({ ...f, [field]: value }));

  function Section({ title, number, children }) {
    const isOpen = openSections[number] !== false;
    return (
      <div className={`${cx.card} overflow-hidden`}>
        <button
          onClick={() => setOpenSections(s => ({ ...s, [number]: !isOpen }))}
          className="w-full flex items-center justify-between p-4 lg:cursor-default"
        >
          <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
          <span className="lg:hidden">
            {isOpen ? <ChevronUp size={16} className="text-stone-400" /> : <ChevronDown size={16} className="text-stone-400" />}
          </span>
        </button>
        <div className={`${isOpen ? 'block' : 'hidden lg:block'} px-4 pb-4`}>
          {children}
        </div>
      </div>
    );
  }

  function EditInput({ value, onChange, placeholder, type = 'number', suffix }) {
    return (
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cx.input + ' max-w-[160px]'}
        />
        {suffix && <span className="text-xs text-stone-400">{suffix}</span>}
      </div>
    );
  }

  function Field({ label, value, accent, edit }) {
    return (
      <div>
        <span className={cx.label}>{label}</span>
        {editing && edit ? edit : (
          <p className={`text-sm font-medium ${accent ? 'text-[var(--accent)]' : 'text-stone-800'}`}>{value}</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className={cx.skeleton + ' h-24'} />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className={`${cx.card} p-12 text-center`}>
          <Package size={40} className="mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">No se pudo cargar la ficha tecnica.</p>
          <button onClick={() => navigate(-1)} className={cx.btnSecondary + ' mt-4'}>Volver</button>
        </div>
      </div>
    );
  }

  const { producto, preparaciones, materiales, user_settings, calculos } = data;
  const hasMermaPrep = preparaciones.some(p => p.merma_pct > 0);

  return (
    <div className="max-w-6xl mx-auto print:max-w-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className={cx.btnGhost}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-stone-900">{tm.ficha_tecnica}</h1>
            <p className="text-sm text-stone-500">{producto.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden ml-11 sm:ml-0">
          <button onClick={() => window.print()} className={cx.btnSecondary + ' flex items-center gap-2 text-xs sm:text-sm'}>
            <Printer size={14} /> <span className="hidden sm:inline">Imprimir</span>
          </button>
          {!editing ? (
            <button onClick={startEditing} className={cx.btnPrimary + ' flex items-center gap-2'}>
              <Pencil size={14} /> Editar
            </button>
          ) : (
            <>
              <button onClick={handleSave} disabled={saving} className={cx.btnPrimary + ' flex items-center gap-2'}>
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save size={14} /> Guardar</>}
              </button>
              <button onClick={() => setEditing(false)} className={cx.btnSecondary + ' flex items-center gap-1'}>
                <X size={14} /> Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {/* Section 1 — Identificacion */}
        <Section title="1. Identificacion" number={1}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="Nombre" value={producto.nombre} />
            <Field label="Codigo" value={`#${String(producto.id).padStart(4, '0')}`} />
            <Field label="Tipo presentacion" value={producto.tipo_presentacion === 'entero' ? 'Entero' : 'Unidad'} />
            <Field label="Unidades por producto" value={producto.unidades_por_producto || 1} />
            <Field label="Creado" value={formatDate(producto.created_at)} />
            <Field label="Actualizado" value={formatDate(producto.updated_at)} />
          </div>
          {producto.imagen_url && (
            <div className="mt-4">
              <img src={producto.imagen_url} alt={producto.nombre} className="w-32 h-24 object-cover rounded-lg border border-stone-200" />
            </div>
          )}
        </Section>

        {/* Section 2 — Produccion */}
        <Section title="2. Produccion" number={2}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Tamano tanda" value={`${producto.unidades_por_producto || 1} unidades`} />
            <Field
              label="Tiempo activo MO"
              value={`${calculos.tiempo_activo} min`}
              edit={<EditInput value={editForm.tiempo_activo_min} onChange={v => ef('tiempo_activo_min', v)} placeholder="min" suffix="min" />}
            />
            <Field
              label="Tiempo horno/reposo"
              value={`${producto.tiempo_horno_min || 0} min`}
              edit={<EditInput value={editForm.tiempo_horno_min} onChange={v => ef('tiempo_horno_min', v)} placeholder="min" suffix="min" />}
            />
            <Field
              label="Tarifa MO"
              value={`${simbolo} ${calculos.tarifa_mo}/hora`}
              accent={!!producto.tarifa_mo_override}
              edit={
                <EditInput
                  value={editForm.tarifa_mo_override}
                  onChange={v => ef('tarifa_mo_override', v)}
                  placeholder={user_settings?.tarifa_mo_global ? `Global: ${user_settings.tarifa_mo_global}` : '0'}
                  suffix="/hora"
                />
              }
            />
          </div>
        </Section>

        {/* Section 3 — Ingredientes por preparacion */}
        <Section title="3. Ingredientes por preparacion" number={3}>
          {preparaciones.map((prep, pi) => (
            <div key={prep.id} className="mb-5 last:mb-0">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-stone-800">{prep.nombre || `Preparacion ${pi + 1}`}</h4>
                {prep.capacidad && (
                  <span className="text-xs text-stone-400">Rinde: {parseFloat(prep.capacidad)} {prep.unidad_capacidad || ''}</span>
                )}
              </div>
              <div className="border border-stone-100 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-stone-50">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Ingrediente</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Cant. neta</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">UM</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Costo/UM</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-amber-500 uppercase">% Merma</th>
                      <th className="text-center px-3 py-2 text-[10px] font-semibold text-[var(--accent)] uppercase">Cant. bruta</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prep.insumos.map((ins, ii) => (
                      <tr key={ii} className="border-t border-stone-100">
                        <td className="px-3 py-2 text-stone-800">{ins.nombre}</td>
                        <td className="px-3 py-2 text-center text-stone-600">{ins.cant_neta}</td>
                        <td className="px-3 py-2 text-center text-stone-400 text-xs">{ins.uso_unidad || ins.unidad_medida}</td>
                        <td className="px-3 py-2 text-center text-stone-500">{formatCurrency(ins.costo_unitario)}</td>
                        <td className="px-3 py-2 text-center text-amber-600 font-medium">{ins.merma_pct > 0 ? `${ins.merma_pct}%` : '-'}</td>
                        <td className="px-3 py-2 text-center text-[var(--accent)] font-medium">{ins.merma_pct > 0 ? ins.cant_bruta : '-'}</td>
                        <td className="px-3 py-2 text-right text-stone-800">{formatCurrency(ins.subtotal_con_merma)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-6 mt-2 text-sm">
                <span className="text-stone-400">Total tanda: <span className="text-stone-700 font-medium">{formatCurrency(prep.costo_tanda)}</span></span>
                <span className="text-stone-400">Costo porcion usada: <span className="text-[var(--accent)] font-medium">{formatCurrency(prep.costo_porcion_con_merma)}</span></span>
              </div>
            </div>
          ))}
          {preparaciones.length > 0 && (
            <div className="border-t border-stone-200 pt-3 mt-3 flex justify-end">
              <span className="text-sm font-semibold text-stone-700">Total insumos ensamblados: <span className="text-[var(--accent)]">{formatCurrency(calculos.food_cost - calculos.costo_empaque)}</span></span>
            </div>
          )}
        </Section>

        {/* Section 4 — Mermas de preparacion */}
        {hasMermaPrep && (
          <Section title="4. Mermas de preparacion" number={4}>
            <div className="border border-stone-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Preparacion</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Costo porcion</th>
                    <th className="text-center px-3 py-2 text-[10px] font-semibold text-amber-500 uppercase">% Merma prep</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold text-stone-400 uppercase">Costo adicional</th>
                  </tr>
                </thead>
                <tbody>
                  {preparaciones.filter(p => p.merma_pct > 0).map((prep, pi) => (
                    <tr key={pi} className="border-t border-stone-100">
                      <td className="px-3 py-2 text-stone-800">{prep.nombre}</td>
                      <td className="px-3 py-2 text-center text-stone-600">{formatCurrency(prep.costo_porcion)}</td>
                      <td className="px-3 py-2 text-center text-amber-600 font-medium">{prep.merma_pct}%</td>
                      <td className="px-3 py-2 text-right text-rose-600">{formatCurrency(prep.costo_merma_prep)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <span className="text-sm font-semibold text-stone-700">Total mermas: <span className="text-rose-600">{formatCurrency(calculos.total_merma_prep)}</span></span>
            </div>
          </Section>
        )}

        {/* Section 5 — Food Cost */}
        <Section title={`${hasMermaPrep ? '5' : '4'}. Food Cost`} number={5}>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Insumos ensamblados (con mermas)</span>
              <span className="text-[var(--accent)] font-medium">{formatCurrency(calculos.food_cost - calculos.costo_empaque)}</span>
            </div>
            {calculos.total_merma_prep > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Mermas preparacion</span>
                <span className="text-stone-700">{formatCurrency(calculos.total_merma_prep)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Empaque</span>
              <span className="text-stone-700">{formatCurrency(calculos.costo_empaque)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-stone-100">
              <span className="text-stone-800">Food cost total</span>
              <span className="text-[var(--accent)]">{formatCurrency(calculos.food_cost)}</span>
            </div>
            {calculos.precio_venta > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-400">Food cost % sobre precio actual</span>
                <span className="text-stone-600">{calculos.precio_venta > 0 ? ((calculos.food_cost / calculos.precio_venta) * 100).toFixed(1) : 0}%</span>
              </div>
            )}
          </div>
        </Section>

        {/* Section 6 — Mano de obra */}
        <Section title={`${hasMermaPrep ? '6' : '5'}. Mano de obra`} number={6}>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500 flex items-center gap-1"><Clock size={14} /> Tiempo activo</span>
              <span className="text-stone-700">{calculos.tiempo_activo} min</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500 flex items-center gap-1">
                <DollarSign size={14} /> Tarifa MO
                <span className="text-[10px] text-stone-400 ml-1">({producto.tarifa_mo_override ? 'producto' : 'global'})</span>
              </span>
              <span className="text-stone-700">{simbolo} {calculos.tarifa_mo}/hora</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Costo MO tanda</span>
              <span className="text-stone-700">{formatCurrency(calculos.costo_mo_tanda)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-stone-100">
              <span className="text-stone-800">Costo MO unitario</span>
              <span className="text-[var(--accent)]">{formatCurrency(calculos.costo_mo_unitario)}</span>
            </div>
          </div>
        </Section>

        {/* Section 7 — CIF */}
        <Section title={`${hasMermaPrep ? '7' : '6'}. CIF (Costos indirectos)`} number={7}>
          <div className="space-y-3">
            <Field
              label="Gas / electricidad por unidad"
              value={formatCurrency(calculos.cif_gas)}
              edit={
                <div>
                  <EditInput value={editForm.cif_gas_unitario} onChange={v => ef('cif_gas_unitario', v)} placeholder="0.00" />
                  <p className="text-[10px] text-stone-400 mt-1">Divide tu factura mensual entre las unidades producidas ese mes</p>
                </div>
              }
            />
            <Field
              label="Overhead por unidad (alquiler, depreciacion, limpieza)"
              value={formatCurrency(calculos.cif_overhead)}
              edit={<EditInput value={editForm.cif_overhead_unitario} onChange={v => ef('cif_overhead_unitario', v)} placeholder="0.00" />}
            />
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-stone-100">
              <span className="text-stone-800">CIF unitario total</span>
              <span className="text-[var(--accent)]">{formatCurrency(calculos.cif_unitario)}</span>
            </div>
          </div>
        </Section>

        {/* Section 8 — Costo neto */}
        <Section title={`${hasMermaPrep ? '8' : '7'}. Costo neto`} number={8}>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Food cost</span>
              <span className="text-stone-700">{formatCurrency(calculos.food_cost)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Mano de obra</span>
              <span className="text-stone-700">{formatCurrency(calculos.costo_mo_unitario)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">CIF</span>
              <span className="text-stone-700">{formatCurrency(calculos.cif_unitario)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-stone-200">
              <span className="text-base font-bold text-stone-900">Costo neto unitario</span>
              <span className="text-xl font-bold text-[var(--accent)]">{formatCurrency(calculos.costo_neto)}</span>
            </div>
            {/* Proportional bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-stone-100 mt-3">
              <div className="bg-emerald-500" style={{ width: `${calculos.pct_food}%` }} title={`Food cost ${calculos.pct_food}%`} />
              <div className="bg-blue-500" style={{ width: `${calculos.pct_mo}%` }} title={`MO ${calculos.pct_mo}%`} />
              <div className="bg-amber-500" style={{ width: `${calculos.pct_cif}%` }} title={`CIF ${calculos.pct_cif}%`} />
            </div>
            <div className="flex justify-between text-[10px] text-stone-400 mt-1">
              <span>Food {calculos.pct_food}%</span>
              <span>MO {calculos.pct_mo}%</span>
              <span>CIF {calculos.pct_cif}%</span>
            </div>
          </div>
        </Section>

        {/* Section 9 — Precio de venta */}
        <Section title={`${hasMermaPrep ? '9' : '8'}. Precio de venta`} number={9}>
          <div className="space-y-2">
            <Field
              label={`Margen minimo objetivo (${producto.margen_minimo_override ? 'producto' : 'global'})`}
              value={`${calculos.margen_minimo}%`}
              edit={
                <EditInput
                  value={editForm.margen_minimo_override}
                  onChange={v => ef('margen_minimo_override', v)}
                  placeholder={user_settings?.margen_minimo_global ? `Global: ${user_settings.margen_minimo_global}%` : '33'}
                  suffix="%"
                />
              }
            />
            <div className="flex justify-between text-sm mt-3">
              <span className="text-stone-500">Precio minimo</span>
              <span className="text-[var(--accent)] font-medium">{formatCurrency(calculos.precio_minimo)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Precio actual</span>
              <span className="text-stone-800 font-semibold">{formatCurrency(calculos.precio_venta)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-stone-500">Margen real</span>
              <span className={`font-semibold ${calculos.margen_real < calculos.margen_minimo ? 'text-rose-600' : 'text-[var(--accent)]'}`}>
                {calculos.margen_real}%
              </span>
            </div>
            {calculos.precio_venta > 0 && calculos.precio_venta < calculos.precio_minimo && (
              <div className="flex items-center gap-2 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                <p className="text-sm text-rose-700">
                  El precio actual esta por debajo del precio minimo. Margen real: <strong>{calculos.margen_real}%</strong> (minimo: {calculos.margen_minimo}%)
                </p>
              </div>
            )}
          </div>
        </Section>

        {/* Section 10 — Instrucciones */}
        <Section title={`${hasMermaPrep ? '10' : '9'}. Instrucciones`} number={10}>
          <div className="space-y-4">
            {preparaciones.map((prep, pi) => (
              <div key={prep.id}>
                <span className={cx.label}>{prep.nombre || `Preparacion ${pi + 1}`}</span>
                {editing ? (
                  <textarea
                    value={editForm.instrucciones_prep?.[pi]?.instrucciones || ''}
                    onChange={e => {
                      const updated = [...(editForm.instrucciones_prep || [])];
                      updated[pi] = { ...updated[pi], instrucciones: e.target.value };
                      setEditForm(f => ({ ...f, instrucciones_prep: updated }));
                    }}
                    rows={3}
                    placeholder="Instrucciones de esta preparacion..."
                    className={cx.input + ' resize-y'}
                  />
                ) : (
                  <p className="text-sm text-stone-600 whitespace-pre-wrap">{prep.instrucciones || <span className="text-stone-300 italic">Sin instrucciones</span>}</p>
                )}
              </div>
            ))}
            <div className="pt-3 border-t border-stone-100">
              <span className={cx.label}>Instrucciones de ensamble</span>
              {editing ? (
                <textarea
                  value={editForm.instrucciones_ensamble || ''}
                  onChange={e => ef('instrucciones_ensamble', e.target.value)}
                  rows={4}
                  placeholder="Instrucciones para ensamblar el producto final..."
                  className={cx.input + ' resize-y'}
                />
              ) : (
                <p className="text-sm text-stone-600 whitespace-pre-wrap">{producto.instrucciones_ensamble || <span className="text-stone-300 italic">Sin instrucciones</span>}</p>
              )}
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
