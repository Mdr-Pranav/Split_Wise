// Built-in buckets every group can pick from. Groups can add their own too;
// custom ones get the tag icon.
export const PRESET_BUCKETS = [
  { name: 'Food', icon: 'utensils', tint: 'bg-orange-500/10 text-orange-600' },
  { name: 'Groceries', icon: 'cart', tint: 'bg-emerald-500/10 text-emerald-600' },
  { name: 'Cab', icon: 'car', tint: 'bg-amber-500/15 text-amber-600' },
  { name: 'Travel', icon: 'plane', tint: 'bg-sky-500/10 text-sky-600' },
  { name: 'Stay', icon: 'bed', tint: 'bg-indigo-500/10 text-indigo-600' },
  { name: 'Rent', icon: 'home', tint: 'bg-violet-500/10 text-violet-600' },
  { name: 'Bills', icon: 'bolt', tint: 'bg-cyan-500/10 text-cyan-600' },
  { name: 'Shopping', icon: 'bag', tint: 'bg-pink-500/10 text-pink-600' },
  { name: 'Fun', icon: 'ticket', tint: 'bg-fuchsia-500/10 text-fuchsia-600' },
  { name: 'Other', icon: 'tag', tint: 'bg-slate-500/10 text-slate-600' },
];

const CUSTOM = { icon: 'tag', tint: 'bg-brand-500/10 text-brand-600' };

export function bucketStyle(name = '') {
  const preset = PRESET_BUCKETS.find((b) => b.name.toLowerCase() === name.toLowerCase());
  return preset || { name, ...CUSTOM };
}

// Presets first, then any custom buckets this group has used
export function bucketsForGroup(expenses) {
  const seen = new Set(PRESET_BUCKETS.map((b) => b.name.toLowerCase()));
  const custom = [];
  for (const e of expenses) {
    const key = e.bucket.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      custom.push({ name: e.bucket, ...CUSTOM });
    }
  }
  return [...PRESET_BUCKETS, ...custom];
}

// Match a typed name against existing buckets so "cab" becomes "Cab"
export function canonicalBucket(name, buckets) {
  const trimmed = name.trim();
  return buckets.find((b) => b.name.toLowerCase() === trimmed.toLowerCase())?.name || trimmed;
}
