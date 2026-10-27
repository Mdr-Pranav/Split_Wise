// Group history export: CSV for spreadsheets, PDF as a readable report.
// Built in the browser from what the group page already loaded.

import { bucketDebts, fromCents, toCents } from './money';

const STATUS = { confirmed: 'Confirmed', pending: 'Waiting for confirmation', rejected: 'Declined' };

const inRange = (ymd, from, to) => (!from || ymd >= from) && (!to || ymd <= to);

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function niceDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Everything both formats need, limited to the chosen date range
export function prepareExport({ group, people, expenses, settlements, from, to }) {
  const nameOf = (id) => people.find((p) => p.user_id === id)?.display_name || 'Former member';
  const exp = expenses
    .filter((e) => inRange(e.expense_date, from, to))
    .sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.created_at.localeCompare(b.created_at));
  const pay = settlements
    .filter((s) => inRange(s.settled_on, from, to))
    .sort((a, b) => a.settled_on.localeCompare(b.settled_on) || a.created_at.localeCompare(b.created_at));

  const buckets = new Map();
  for (const e of exp) {
    const b = buckets.get(e.bucket) || { bucket: e.bucket, count: 0, cents: 0 };
    b.count += 1;
    b.cents += toCents(e.amount);
    buckets.set(e.bucket, b);
  }
  const totalCents = [...buckets.values()].reduce((a, b) => a + b.cents, 0);

  const perPerson = people.map((p) => {
    const paid = exp.filter((e) => e.paid_by === p.user_id).reduce((a, e) => a + toCents(e.amount), 0);
    const share = exp.reduce((a, e) => a + toCents(e.expense_splits.find((s) => s.user_id === p.user_id)?.amount || 0), 0);
    const confirmed = pay.filter((s) => s.status === 'confirmed');
    const sent = confirmed.filter((s) => s.from_user === p.user_id).reduce((a, s) => a + toCents(s.amount), 0);
    const received = confirmed.filter((s) => s.to_user === p.user_id).reduce((a, s) => a + toCents(s.amount), 0);
    return { name: p.display_name, member: p.is_member, paid, share, sent, received };
  });

  // Who owes whom is always as of today, whatever the range
  const owed = bucketDebts(expenses, settlements).map((d) => ({ ...d, from: nameOf(d.debtor), to: nameOf(d.creditor) }));

  const rangeLabel = from || to ? `${from ? niceDate(from) : 'Start'} – ${to ? niceDate(to) : 'Today'}` : 'All time';
  return { group, nameOf, exp, pay, buckets: [...buckets.values()].sort((a, b) => b.cents - a.cents), totalCents, perPerson, owed, rangeLabel };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

// Quote when needed; neutralise text that spreadsheets would run as a formula
function cell(value) {
  if (value == null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(input) {
  const { group, nameOf, exp, pay } = prepareExport(input);
  const people = input.people;
  const header = ['Date', 'Type', 'Bucket', 'Note', 'Paid by', 'Paid to', `Amount (${group.currency})`, 'Split', 'Status', ...people.map((p) => `${p.display_name} share`)];

  const rows = [
    ...exp.map((e) => ({
      date: e.expense_date,
      at: e.created_at,
      cells: [
        e.expense_date,
        'Expense',
        e.bucket,
        e.note || '',
        nameOf(e.paid_by),
        '',
        Number(e.amount).toFixed(2),
        { equal: 'Equal', exact: 'Exact amounts', percent: 'Percent' }[e.split_type],
        '',
        ...people.map((p) => {
          const share = e.expense_splits.find((s) => s.user_id === p.user_id);
          return share ? Number(share.amount).toFixed(2) : '';
        }),
      ],
    })),
    ...pay.map((s) => ({
      date: s.settled_on,
      at: s.created_at,
      cells: [s.settled_on, 'Payment', s.bucket, s.note || '', nameOf(s.from_user), nameOf(s.to_user), Number(s.amount).toFixed(2), '', STATUS[s.status], ...people.map(() => '')],
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  const csv = [header, ...rows.map((r) => r.cells)].map((r) => r.map(cell).join(',')).join('\r\n');
  // BOM so Excel reads names and ₹ correctly
  download(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), `${slug(group.name)}-${today()}.csv`);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

// Built-in PDF fonts have no ₹ glyph, so amounts read "INR 1,200"
function pdfMoney(cents, currency) {
  const n = fromCents(cents);
  const whole = Math.abs(cents) % 100 === 0;
  const text = Math.abs(n).toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}${currency} ${text}`;
}

export async function exportPdf(input) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const data = prepareExport(input);
  const { group, nameOf, exp, pay, buckets, totalCents, perPerson, owed, rangeLabel } = data;
  const cur = group.currency;
  const money = (c) => pdfMoney(c, cur);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const brand = [29, 78, 216];
  const ink = [15, 23, 42];
  const muted = [100, 116, 139];
  let y = margin;

  // Title
  doc.setFillColor(...brand);
  doc.roundedRect(margin, y, 26, 26, 6, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('%', margin + 13, y + 18, { align: 'center' });
  doc.setTextColor(...ink);
  doc.setFontSize(20);
  doc.text(group.name, margin + 36, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...muted);
  doc.text(`Split Wise expense history  ·  ${rangeLabel}  ·  Generated ${niceDate(today())}`, margin + 36, y + 27);
  y += 50;

  // Headline numbers
  const confirmedPaid = pay.filter((s) => s.status === 'confirmed').reduce((a, s) => a + toCents(s.amount), 0);
  const stats = [
    ['Total spent', money(totalCents)],
    ['Expenses', String(exp.length)],
    ['Payments settled', money(confirmedPaid)],
    ['Still owed today', money(owed.reduce((a, d) => a + d.cents, 0))],
  ];
  const boxW = (pageW - margin * 2 - 3 * 8) / 4;
  stats.forEach(([label, value], i) => {
    const x = margin + i * (boxW + 8);
    doc.setFillColor(239, 244, 255);
    doc.roundedRect(x, y, boxW, 46, 6, 6, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(label, x + 10, y + 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    doc.text(value, x + 10, y + 34);
    doc.setFont('helvetica', 'normal');
  });
  y += 64;

  const table = (title, head, body, opts = {}) => {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...ink);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: y + 8,
      head: [head],
      body,
      margin: { left: margin, right: margin },
      styles: { font: 'helvetica', fontSize: 8.5, textColor: ink, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5 },
      headStyles: { fillColor: brand, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      rowPageBreak: 'avoid',
      ...opts,
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 24;
  };

  const emptyNote = (title, text) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...ink);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...muted);
    doc.text(text, margin, y + 16);
    y += 36;
  };

  if (buckets.length) {
    table(
      'Spending by bucket',
      ['Bucket', 'Expenses', 'Total', 'Share of spending'],
      buckets.map((b) => [b.bucket, String(b.count), money(b.cents), `${Math.round((b.cents / totalCents) * 100)}%`]),
      { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } }
    );
  }

  table(
    'Per person',
    ['Person', 'Paid for expenses', 'Their share', 'Payments sent', 'Payments received'],
    perPerson.map((p) => [p.member ? p.name : `${p.name} (left)`, money(p.paid), money(p.share), money(p.sent), money(p.received)]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  if (owed.length) {
    table(
      'Who owes whom (as of today)',
      ['Owes', 'To', 'Bucket', 'Amount'],
      owed.map((d) => [d.from, d.to, d.bucket, money(d.cents)]),
      { columnStyles: { 3: { halign: 'right' } } }
    );
  } else {
    emptyNote('Who owes whom (as of today)', 'Everyone is settled up.');
  }

  const rows = [
    ...exp.map((e) => ({
      date: e.expense_date,
      at: e.created_at,
      cells: [
        niceDate(e.expense_date),
        e.bucket,
        [e.note, e.expense_splits.map((s) => `${nameOf(s.user_id)} ${money(toCents(s.amount))}`).join(', ')].filter(Boolean).join('\n'),
        `${nameOf(e.paid_by)} paid`,
        money(toCents(e.amount)),
      ],
    })),
    ...pay.map((s) => ({
      date: s.settled_on,
      at: s.created_at,
      cells: [
        niceDate(s.settled_on),
        `${s.bucket} payment`,
        [s.note, STATUS[s.status]].filter(Boolean).join(' · '),
        `${nameOf(s.from_user)} to ${nameOf(s.to_user)}`,
        money(toCents(s.amount)),
      ],
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));

  if (rows.length) {
    table('All transactions', ['Date', 'Bucket', 'Details', 'Who', 'Amount'], rows.map((r) => r.cells), {
      columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 78 }, 3: { cellWidth: 100 }, 4: { halign: 'right', cellWidth: 72 } },
    });
  } else {
    emptyNote('All transactions', 'Nothing in this date range.');
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${group.name} · Page ${i} of ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 20, { align: 'center' });
  }

  doc.save(`${slug(group.name)}-${today()}.pdf`);
}
