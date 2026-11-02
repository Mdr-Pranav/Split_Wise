// The user's own group list: pinned on top, then the rest, archived apart.
// Order comes from the server (my_groups()); these keep it while editing.

export function arrangeGroups(groups) {
  const list = groups || [];
  return {
    pinned: list.filter((g) => g.pinned && !g.archived),
    others: list.filter((g) => !g.pinned && !g.archived),
    archived: list.filter((g) => g.archived),
  };
}

// A copy of list with the item at `from` moved to `to`
export function moveItem(list, from, to) {
  const out = [...list];
  if (from === to || from < 0 || from >= list.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

// Where a dragged row lands: how many other rows' middles it has passed.
// rects: each row's { top, height } at drag start; dy: how far it has moved.
export function dropIndex(rects, from, dy) {
  const r = rects[from];
  const middle = r.top + r.height / 2 + dy;
  let to = 0;
  rects.forEach((other, i) => {
    if (i !== from && other.top + other.height / 2 < middle) to += 1;
  });
  return to;
}
