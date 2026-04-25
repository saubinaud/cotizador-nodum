import { cx } from '../styles/tokens';

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-bold text-stone-900 mb-2">{title}</h3>
        <p className="text-stone-500 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={cx.btnSecondary}>
            Cancelar
          </button>
          <button onClick={onConfirm} className={cx.btnDanger + ' bg-rose-50'}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
