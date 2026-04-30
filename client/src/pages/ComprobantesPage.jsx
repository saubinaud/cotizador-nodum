import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { cx } from '../styles/tokens';
import { formatCurrency, formatDate } from '../utils/format';
import CustomSelect from '../components/CustomSelect';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import {
  FileText, Receipt, Eye, Ban, DollarSign,
  Settings, Upload, CheckCircle, Circle, AlertTriangle, Search,
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
  const { user } = useAuth();

  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [tipoFilter, setTipoFilter] = useState('');
  const [anularTarget, setAnularTarget] = useState(null);

  // Facturacion config state
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [buscandoRuc, setBuscandoRuc] = useState(false);

  // Load facturacion config
  async function loadConfig() {
    try {
      const res = await api.get('/facturacion/config');
      setConfig(res.data || res);
    } catch { /* config not available yet */ }
    finally { setLoadingConfig(false); }
  }

  // Load periodos + config on mount
  useEffect(() => {
    loadConfig();
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

  // Buscar direccion fiscal desde RUC (SUNAT)
  async function buscarDireccionFiscal() {
    const ruc = user?.ruc;
    if (!ruc || ruc.length !== 11) {
      toast.error('Primero configura tu RUC en Perfil (11 dígitos)');
      return;
    }
    setBuscandoRuc(true);
    try {
      const res = await api.get(`/facturacion/buscar-ruc/${ruc}`);
      const d = res.data || res;
      if (d.direccion) {
        setConfigForm(prev => ({
          ...prev,
          direccion_fiscal: d.direccion || prev.direccion_fiscal,
          departamento: d.departamento || prev.departamento,
          provincia: d.provincia || prev.provincia,
          distrito: d.distrito || prev.distrito,
          ubigeo: d.ubigeo || prev.ubigeo,
        }));
        toast.success('Dirección encontrada');
      } else {
        toast.error('No se encontró dirección para este RUC');
      }
    } catch (err) {
      toast.error('Error buscando dirección');
    } finally {
      setBuscandoRuc(false);
    }
  }

  // Config handlers
  function startEditConfig() {
    setConfigForm({
      direccion_fiscal: config?.direccion_fiscal || '',
      departamento: config?.departamento || '',
      provincia: config?.provincia || '',
      distrito: config?.distrito || '',
      ubigeo: config?.ubigeo || '',
      sol_user: config?.sol_user || '',
      sol_pass: config?.sol_pass || '',
    });
    setEditingConfig(true);
  }

  async function handleSaveConfig() {
    setSavingConfig(true);
    try {
      await api.put('/facturacion/config', configForm);
      toast.success('Configuracion actualizada');
      setEditingConfig(false);
      loadConfig();
    } catch (err) {
      toast.error(err.message || 'Error guardando');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleCertUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const password = window.prompt('Ingresa la contraseña del certificado (déjalo vacío si no tiene):') ?? '';
    setUploadingCert(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          await api.post('/facturacion/certificado', {
            cert_base64: base64,
            cert_password: password,
          });
          toast.success('Certificado subido correctamente');
          loadConfig();
        } catch (err) {
          toast.error(err.message || 'Error subiendo certificado');
        } finally {
          setUploadingCert(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Error procesando archivo');
      setUploadingCert(false);
    }
  }

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

      {/* Facturacion Setup Banner */}
      {config && !config.habilitado && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">Configuración de facturación electrónica</h3>
          </div>

          {/* Guide: Register as electronic issuer in SUNAT */}
          <div className="p-3 bg-white rounded-lg border border-amber-100 mb-3">
            <p className="text-xs font-bold text-stone-800 mb-2">Antes de empezar: Habilitarte en SUNAT como emisor electrónico</p>
            <p className="text-[11px] text-stone-600 mb-2">Este paso se hace una sola vez directamente en SUNAT. Sin esto, SUNAT rechazará tus comprobantes.</p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 w-4">1.</span>
                <p className="text-[11px] text-stone-600">Entra a <strong className="text-stone-800">clave.sol.gob.pe</strong> con tu RUC, usuario SOL y clave SOL</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 w-4">2.</span>
                <p className="text-[11px] text-stone-600">En el menú, ve a <strong className="text-stone-800">Empresas → Comprobantes de Pago Electrónicos</strong></p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 w-4">3.</span>
                <p className="text-[11px] text-stone-600">Busca y selecciona <strong className="text-stone-800">"SEE - Desde los sistemas del contribuyente"</strong></p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 w-4">4.</span>
                <p className="text-[11px] text-stone-600">Sube tu <strong className="text-stone-800">certificado digital (.p12)</strong> y registra un <strong className="text-stone-800">correo electrónico</strong> de contacto</p>
              </div>
              <div className="flex gap-2">
                <span className="text-[10px] font-bold text-[var(--accent)] shrink-0 w-4">5.</span>
                <p className="text-[11px] text-stone-600">Confirma la inscripción. <strong className="text-rose-600">IMPORTANTE: La habilitación se activa al día calendario siguiente.</strong> No podrás emitir el mismo día que te registras.</p>
              </div>
            </div>
          </div>

          {/* Guide: Steps in Kudi */}
          <p className="text-xs font-bold text-stone-800 mb-2">Después, configura aquí en Kudi:</p>
          <div className="space-y-2">
            {/* Step 1: RUC */}
            <div className="flex items-start gap-2">
              {config.direccion_fiscal ? <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={14} className="text-stone-300 mt-0.5 shrink-0" />}
              <div>
                <p className={`text-xs font-medium ${config.direccion_fiscal ? 'text-stone-700' : 'text-stone-400'}`}>Dirección fiscal</p>
                <p className="text-[10px] text-stone-400">Haz click en "Configurar" abajo. Puedes usar el botón "Buscar mi dirección" para auto-completar desde tu RUC.</p>
              </div>
            </div>

            {/* Step 2: SOL credentials */}
            <div className="flex items-start gap-2">
              {config.sol_user ? <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={14} className="text-stone-300 mt-0.5 shrink-0" />}
              <div>
                <p className={`text-xs font-medium ${config.sol_user ? 'text-stone-700' : 'text-stone-400'}`}>Usuario y clave SOL</p>
                <p className="text-[10px] text-stone-400">El mismo usuario y contraseña con los que entras a SUNAT. Kudi los usa para firmar y enviar tus comprobantes. Se guardan encriptados.</p>
              </div>
            </div>

            {/* Step 3: Certificate */}
            <div className="flex items-start gap-2">
              {config.certificado_subido ? <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={14} className="text-stone-300 mt-0.5 shrink-0" />}
              <div>
                <p className={`text-xs font-medium ${config.certificado_subido ? 'text-stone-700' : 'text-stone-400'}`}>Certificado digital (.p12)</p>
                <p className="text-[10px] text-stone-400">Descárgalo gratis desde SOL → Empresas → Certificado Digital Tributario (CDT). Te pedirá crear una contraseña de 8+ caracteres — anótala porque la necesitarás al subirlo aquí.</p>
              </div>
            </div>

            {/* Step 4: Auto-enabled */}
            <div className="flex items-start gap-2">
              {config.habilitado ? <CheckCircle size={14} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={14} className="text-stone-300 mt-0.5 shrink-0" />}
              <div>
                <p className={`text-xs font-medium ${config.habilitado ? 'text-stone-700' : 'text-stone-400'}`}>Facturación activa</p>
                <p className="text-[10px] text-stone-400">Se activa automáticamente cuando completes los 3 pasos anteriores. No necesitas hacer nada adicional.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config card */}
      {!loadingConfig && config && (
        <div className={cx.card + ' p-4 mb-4'}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-stone-900">Configuracion de facturacion</h3>
            {!editingConfig && (
              <button onClick={() => startEditConfig()} className={cx.btnGhost + ' text-xs flex items-center gap-1'}>
                <Settings size={14} /> Configurar
              </button>
            )}
          </div>

          {editingConfig ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={buscarDireccionFiscal} disabled={buscandoRuc}
                  className={cx.btnSecondary + ' text-xs flex items-center gap-1'}>
                  <Search size={14} /> {buscandoRuc ? 'Buscando...' : 'Buscar mi dirección (SUNAT)'}
                </button>
                <span className="text-[10px] text-stone-400">Auto-completa desde tu RUC</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={cx.label}>Direccion fiscal</label>
                  <input type="text" value={configForm.direccion_fiscal || ''} onChange={e => setConfigForm(p => ({...p, direccion_fiscal: e.target.value}))} className={cx.input} placeholder="Av. Principal 123" />
                </div>
                <div>
                  <label className={cx.label}>Departamento</label>
                  <input type="text" value={configForm.departamento || ''} onChange={e => setConfigForm(p => ({...p, departamento: e.target.value}))} className={cx.input} placeholder="Lima" />
                </div>
                <div>
                  <label className={cx.label}>Provincia</label>
                  <input type="text" value={configForm.provincia || ''} onChange={e => setConfigForm(p => ({...p, provincia: e.target.value}))} className={cx.input} placeholder="Lima" />
                </div>
                <div>
                  <label className={cx.label}>Distrito</label>
                  <input type="text" value={configForm.distrito || ''} onChange={e => setConfigForm(p => ({...p, distrito: e.target.value}))} className={cx.input} placeholder="Miraflores" />
                </div>
                <div>
                  <label className={cx.label}>Ubigeo (codigo INEI)</label>
                  <input type="text" value={configForm.ubigeo || ''} onChange={e => setConfigForm(p => ({...p, ubigeo: e.target.value}))} className={cx.input} placeholder="150122" maxLength={6} />
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg mt-2">
                <p className="text-xs text-amber-700 mb-2 font-medium">Credenciales SOL (requerido para emisión)</p>
                <p className="text-[10px] text-amber-600 mb-2">El mismo usuario y clave con los que entras a SUNAT SOL</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={cx.label}>Usuario SOL</label>
                    <input type="text" value={configForm.sol_user || ''} onChange={e => setConfigForm(p => ({...p, sol_user: e.target.value}))} className={cx.input} placeholder="USUARIO01" />
                  </div>
                  <div>
                    <label className={cx.label}>Contraseña SOL</label>
                    <input type="password" value={configForm.sol_pass || ''} onChange={e => setConfigForm(p => ({...p, sol_pass: e.target.value}))} className={cx.input} placeholder="********" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={handleSaveConfig} disabled={savingConfig} className={cx.btnPrimary + ' text-sm'}>
                  {savingConfig ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setEditingConfig(false)} className={cx.btnGhost + ' text-sm'}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-stone-400">Direccion</span>
                <p className="text-stone-800 mt-0.5">{config?.direccion_fiscal || '-'}</p>
              </div>
              <div>
                <span className="text-stone-400">Distrito</span>
                <p className="text-stone-800 mt-0.5">{config?.distrito || '-'}</p>
              </div>
              <div>
                <span className="text-stone-400">Certificado</span>
                <p className={`mt-0.5 font-medium ${config?.certificado_subido ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {config?.certificado_subido ? 'Subido' : 'No subido'}
                </p>
              </div>
              <div>
                <span className="text-stone-400">Estado</span>
                <p className={`mt-0.5 font-medium ${config?.habilitado ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {config?.habilitado ? 'Habilitado' : 'No habilitado'}
                </p>
              </div>
            </div>
          )}

          {/* Certificate upload section */}
          {!config?.certificado_subido && (
            <div className="mt-3 p-3 bg-stone-50 rounded-lg">
              <p className="text-xs text-stone-600 mb-2">
                <strong>Certificado digital:</strong> Descargalo gratis desde SUNAT SOL - Empresas - Comprobantes - CDT. Sube el archivo .p12 aqui.
              </p>
              <div className="flex items-center gap-2">
                <input type="file" accept=".p12,.pfx" id="cert-upload" className="hidden" onChange={handleCertUpload} />
                <label htmlFor="cert-upload" className={cx.btnSecondary + ' text-xs cursor-pointer flex items-center gap-1'}>
                  <Upload size={14} /> Subir certificado .p12
                </label>
                {uploadingCert && <span className="text-xs text-stone-400">Subiendo...</span>}
              </div>
            </div>
          )}

          {/* Series info */}
          {config && (
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-400">
              <span>Serie Factura: <strong className="text-stone-600">{config.serie_factura || 'F001'}</strong> ({config.correlativo_factura || 0})</span>
              <span>Serie Boleta: <strong className="text-stone-600">{config.serie_boleta || 'B001'}</strong> ({config.correlativo_boleta || 0})</span>
            </div>
          )}
        </div>
      )}

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
