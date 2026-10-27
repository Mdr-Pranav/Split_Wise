import { useMemo, useState } from 'react';
import Icon from './Icon';
import Segmented from './Segmented';
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
    <Card title="Export history" subtitle="Download everything, e.g. when a trip ends or someone moves out." className="flex-shrink-0">
      <div className="space-y-3">
        <Segmented
          label="Date range"
          size="sm"
          className="flex w-full"
          value={range}
          onChange={setRange}
          options={[
            { value: 'all', label: 'All' },
            { value: 'month', label: 'This month' },
            { value: 'last', label: 'Last month' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {range === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-slate-500">
              From
              <input type="date" className="input-field mt-1 !py-2" value={custom.from} max={custom.to || today()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </label>
            <label className="text-[12px] text-slate-500">
              To
              <input type="date" className="input-field mt-1 !py-2" value={custom.to} min={custom.from || undefined} max={today()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </label>
          </div>
        )}
        <p className="text-[13px] text-slate-500">
          {counts.expenses} expense{counts.expenses === 1 ? '' : 's'} · {counts.payments} payment{counts.payments === 1 ? '' : 's'} in range
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => run('csv')} disabled={Boolean(busy)} className="btn-secondary">
            <Icon name="download" className="h-4 w-4" /> {busy === 'csv' ? 'Preparing…' : 'CSV'}
          </button>
          <button type="button" onClick={() => run('pdf')} disabled={Boolean(busy)} className="btn-primary">
            <Icon name="download" className="h-4 w-4" /> {busy === 'pdf' ? 'Preparing…' : 'PDF report'}
          </button>
        </div>
      </div>
    </Card>
  );
}
