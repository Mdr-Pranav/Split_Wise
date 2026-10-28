import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upiLink } from '../src/lib/upi.js';
import { fromCents, toCents } from '../src/lib/money.js';

const params = (link) => Object.fromEntries(new URL(link.replace('upi://', 'https://x/')).searchParams);

// Same path the Settle dialog uses: typed rupees → paise → rupees → link
const linkFor = (typed) => upiLink({ vpa: 'aisha@okaxis', name: 'Aisha', amount: fromCents(toCents(typed)), note: 'Splitzy · Goa Trip · Travel' });

test('amount reaches the UPI link in rupees with exactly two decimals', () => {
  const cases = {
    '1': '1.00',
    '1.0': '1.00',
    '01': '1.00',
    '0.5': '0.50',
    '0.01': '0.01',
    '1.5': '1.50',
    '0.29': '0.29', // classic float trap: 0.29 * 100 = 28.999…
    '1.005': '1.01',
    '999.99': '999.99',
    '1234.56': '1234.56',
    '7000': '7000.00',
    '100000': '100000.00',
  };
  for (const [typed, expected] of Object.entries(cases)) {
    assert.equal(params(linkFor(typed)).am, expected, `typed ${typed}`);
  }
});

test('link has no thousands separators, currency symbols or spaces in the amount', () => {
  const am = params(linkFor('123456.7')).am;
  assert.match(am, /^\d+\.\d{2}$/);
});

test('every other field is what the UPI spec expects', () => {
  const link = linkFor('1');
  assert.ok(link.startsWith('upi://pay?pa=aisha@okaxis&'), 'pa first and unencoded');
  const p = params(link);
  assert.equal(p.pa, 'aisha@okaxis');
  assert.equal(p.pn, 'Aisha');
  assert.equal(p.cu, 'INR');
  assert.equal(p.tn, 'Splitzy · Goa Trip · Travel');
  assert.ok(!link.includes('+'), 'spaces are %20, never +');
});

test('"type amount yourself" link has no amount at all', () => {
  const link = upiLink({ vpa: 'aisha@okaxis', name: 'Aisha', amount: 1, note: 'x', withAmount: false });
  assert.equal(params(link).am, undefined);
});
