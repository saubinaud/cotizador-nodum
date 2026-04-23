import { cx } from '../styles/tokens';

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className={`${cx.card} relative p-6 w-full max-w-sm mx-4`}>
        <h3 className="text-white text-lg font-semibold mb-2">{title}</h3>
        <p className="text-zinc-400 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={cx.btnSecondary}>
            Cancelar
          </button>
          <button onClick={onConfirm} className={cx.btnDanger + ' bg-red-500/10'}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}
