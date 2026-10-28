import { useState } from 'react';
import Modal from './Modal';

export default function ConfirmModal({ open, onClose, title, body, confirmLabel = 'Confirm', danger = false, onConfirm, secondaryLabel, onSecondary }) {
  const [busy, setBusy] = useState(false);

  const run = async (action = onConfirm) => {
    setBusy(true);
    try {
      await action();
      onClose();
    } catch {
      // The caller reports the error; keep the dialog open to retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="confirm-title" className="max-w-sm">
      <h2 id="confirm-title" className="pr-10 text-[20px] font-semibold text-ink">{title}</h2>
      {body && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{body}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={secondaryLabel ? () => run(onSecondary) : onClose} disabled={busy}>
          {secondaryLabel || 'Cancel'}
        </button>
        <button
          type="button"
          onClick={() => run()}
          disabled={busy}
          className={danger ? 'btn-primary !bg-[#ff3b30] hover:!bg-[#ff453a]' : 'btn-primary'}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
