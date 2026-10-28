import { useMemo, useState } from 'react';
import Icon from './Icon';
import { exportCsv, exportPdf } from '../lib/exportGroup';
import { today } from '../lib/dates';
import { useToast } from '../context/ToastContext';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Preset ranges as [from, to] in YYYY-MM-DD; null means open-ended
function rangeFor(key, custom) {
  const now = new Date();
  if (key === 'month') return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), null];
  if (key === 'last') return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
  if (key === 'custom') return [custom.from || null, custom.to || null];
  return [null, null];
}

// Download the group's history, e.g. when a trip ends or a flatmate moves out
export default function ExportCard({ group, people, expenses, settlements, Card }) {
  const toast = useToast();
  const [range, setRange] = useState('all');
  const [custom, setCustom] = useState({ from: '', to: today() });
  const [busy, setBusy] = useState('');

  const [from, to] = rangeFor(range, custom);
  const counts = useMemo(() => {
    const inRange = (d) => (!from || d >= from) && (!to || d <= to);
    return {
      expenses: expenses.filter((e) => inRange(e.expense_date)).length,
      payments: settlements.filter((s) => inRange(s.settled_on)).length,
    };
  }, [expenses, settlements, from, to]);

  const run = async (kind) => {
    setBusy(kind);
    try {
      const input = { group, people, expenses, settlements, from, to };
      if (kind === 'csv') exportCsv(input);
      else await exportPdf(input);
      toast.success(`${kind.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setBusy('');
    }
  };

  return (
    <Card
      title="Export history"
      action={
        <select
          aria-label="Date range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="cursor-pointer rounded-full bg-surface-elevated/70 px-3 py-1 text-[12px] font-medium text-ink ring-1 ring-line/10 focus:outline-none focus:ring-brand-500/60"
        >
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="last">Last month</option>
          <option value="custom">Custom…</option>
        </select>
      }
    >
      <div className="space-y-2.5">
        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <input type="date" aria-label="From" className="input-field !py-1.5 text-[13px]" value={custom.from} max={custom.to || today()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <input type="date" aria-label="To" className="input-field !py-1.5 text-[13px]" value={custom.to} min={custom.from || undefined} max={today()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          </div>
        )}
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-500">
            {counts.expenses} expense{counts.expenses === 1 ? '' : 's'} · {counts.payments} payment{counts.payments === 1 ? '' : 's'}
          </p>
          <button type="button" onClick={() => run('csv')} disabled={Boolean(busy)} className="btn-secondary h-9 !px-3 !text-[13px]">
            <Icon name="download" className="h-4 w-4" /> {busy === 'csv' ? '…' : 'CSV'}
          </button>
          <button type="button" onClick={() => run('pdf')} disabled={Boolean(busy)} className="btn-primary h-9 !px-3 !text-[13px]">
            <Icon name="download" className="h-4 w-4" /> {busy === 'pdf' ? '…' : 'PDF'}
          </button>
        </div>
      </div>
    </Card>
  );
}
