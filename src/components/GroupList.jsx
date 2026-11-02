import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import Avatar from './Avatar';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { timeAgo } from '../lib/dates';
import { arrangeGroups, dropIndex, moveItem } from '../lib/order';
import { useGroups } from '../context/GroupsContext';
import { useToast } from '../context/ToastContext';

function Balance({ group }) {
  const owe = Number(group.my_owe);
  const owed = Number(group.my_owed);
  return (
    <span className="flex flex-shrink-0 flex-col items-end text-right text-[13px] font-semibold leading-snug tabular-nums">
      {owe < 0.005 && owed < 0.005 ? (
        <span className="font-medium text-slate-400">Settled up</span>
      ) : (
        <>
          {owed >= 0.005 && <span className="text-emerald-600">+{formatMoney(owed, group.currency)}</span>}
          {owe >= 0.005 && <span className="text-rose-600">−{formatMoney(owe, group.currency)}</span>}
        </>
      )}
    </span>
  );
}

// compact: edit mode, where the buttons need the room
function Details({ group, isMine, compact = false }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-[16px] font-semibold text-ink">{group.name}</span>
        {group.pinned && <Icon name="pin" className="h-3.5 w-3.5 flex-shrink-0 text-brand-600" />}
        {isMine && !compact && (
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
            <Icon name="crown" className="h-3 w-3" /> Owner
          </span>
        )}
      </span>
      <span className="mt-0.5 block truncate text-[13px] text-slate-500">
        {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
        {!isMine && ` · by ${group.owner_name}`} · {timeAgo(group.last_activity)}
      </span>
    </span>
  );
}

// One group on Home; `action` sits beside the link (a button can't go inside it)
function GroupRow({ group, isMine, action, dim = false }) {
  return (
    <li className="flex items-center">
      <Link
        to={`/groups/${group.id}`}
        className={`group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-3 transition-colors hover:bg-surface-elevated/70 sm:gap-4 sm:px-3 ${dim ? 'opacity-70' : ''}`}
      >
        <Avatar id={group.id} name={group.name} size="lg" />
        <Details group={group} isMine={isMine} />
        <Balance group={group} />
        {!action && <Icon name="chevron" className="h-4 w-4 flex-shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />}
      </Link>
      {action}
    </li>
  );
}

const iconButton = 'inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors';

// Rows that can be dragged by their handle (mouse, finger or pen) or moved
// with the arrow keys on the handle
function SortableSection({ label, items, me, onMove, onPin, onArchive }) {
  const listRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const start = (e, from) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = [...listRef.current.children].map((row) => {
      const r = row.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    setDrag({ from, to: from, startY: e.clientY, dy: 0, rects });
  };
  const move = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    setDrag((d) => d && { ...d, dy, to: dropIndex(d.rects, d.from, dy) });
  };
  const end = () => {
    if (!drag) return;
    if (drag.to !== drag.from) onMove(drag.from, drag.to);
    setDrag(null);
  };
  const keys = (e, i) => {
    if (e.key === 'ArrowUp' && i > 0) onMove(i, i - 1);
    else if (e.key === 'ArrowDown' && i < items.length - 1) onMove(i, i + 1);
    else return;
    e.preventDefault();
  };

  // Rows between where the dragged one started and where it is now make room
  const offset = (i) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const h = drag.rects[drag.from].height;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return h;
    return 0;
  };

  if (!items.length) return null;
  return (
    <div>
      {label && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>}
      <ul ref={listRef} className="divide-y divide-surface-border">
        {items.map((g, i) => {
          const dragging = drag?.from === i;
          return (
            <li
              key={g.id}
              className={`relative flex items-center gap-2 px-1 py-2.5 sm:gap-3 ${dragging ? 'z-10 rounded-2xl bg-surface-card shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] ring-1 ring-brand-500/30' : ''}`}
              style={{ transform: `translateY(${offset(i)}px)`, transition: drag && !dragging ? 'transform 200ms cubic-bezier(0.2, 0, 0, 1)' : 'none' }}
            >
              <button
                type="button"
                onPointerDown={(e) => start(e, i)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onKeyDown={(e) => keys(e, i)}
                aria-label={`Move ${g.name}. Drag, or use the up and down arrow keys.`}
                title="Drag to reorder"
                className={`${iconButton} touch-none text-slate-400 hover:bg-surface-elevated hover:text-ink ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                <Icon name="grip" className="h-5 w-5" strokeWidth={2.4} />
              </button>
              <Avatar id={g.id} name={g.name} size="md" />
              <Details group={g} isMine={g.owner_id === me} compact />
              <button
                type="button"
                onClick={() => onPin(g)}
                aria-pressed={g.pinned}
                aria-label={g.pinned ? `Unpin ${g.name}` : `Pin ${g.name} to the top`}
                title={g.pinned ? 'Unpin' : 'Pin to top'}
                className={`${iconButton} ${g.pinned ? 'bg-brand-500/10 text-brand-600' : 'text-slate-400 hover:bg-surface-elevated hover:text-ink'}`}
              >
                <Icon name="pin" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onArchive(g)}
                aria-label={`Archive ${g.name}`}
                title="Archive"
                className={`${iconButton} text-slate-400 hover:bg-surface-elevated hover:text-ink`}
              >
                <Icon name="archive" className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// "Your groups" on Home: pinned first, then the rest in the user's own
// order, archived tucked away at the bottom. Edit to drag, pin or archive.
export default function GroupList({ me, onNew }) {
  const { groups, setGroups, refresh } = useGroups();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { pinned, others, archived } = arrangeGroups(groups);
  const active = pinned.length + others.length;

  const act = async (fn, message) => {
    try {
      await fn();
      if (message) toast.success(message);
    } catch (err) {
      toast.error(err.message);
    }
    refresh();
  };

  // Moves within a section, then saves the whole order top to bottom
  const reorder = (section, from, to) => {
    const next = section === 'pinned' ? [...moveItem(pinned, from, to), ...others] : [...pinned, ...moveItem(others, from, to)];
    setGroups([...next, ...archived]);
    act(() => api.reorderGroups(next.map((g) => g.id)));
  };

  const pin = (g) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, pinned: !g.pinned } : x)));
    act(() => api.setGroupPinned(g.id, !g.pinned));
  };

  const archive = (g, value) => {
    setGroups((list) => list.map((x) => (x.id === g.id ? { ...x, archived: value, pinned: value ? false : x.pinned } : x)));
    act(() => api.setGroupArchived(g.id, value), value ? `${g.name} archived. It’s under Archived at the bottom.` : `${g.name} is back in your groups`);
  };

  return (
    <section className="card flex min-h-[220px] flex-1 flex-col overflow-hidden !p-0">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5">
        <h2 className="text-[16px] font-semibold text-ink">
          Your groups
          {active > 0 && <span className="ml-1.5 text-[13px] font-medium text-slate-400">{active}</span>}
        </h2>
        <div className="flex items-center gap-1.5">
          {active > 0 || editing ? (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-pressed={editing}
              className={editing ? 'btn-primary h-8 !px-3 !text-[13px]' : 'btn-secondary h-8 !px-3 !text-[13px]'}
            >
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : null}
          {!editing && (
            <button type="button" onClick={onNew} className="btn-secondary h-8 !px-3 !text-[13px]">
              <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> New
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
            <Icon name="users" className="h-7 w-7" />
          </div>
          <h3 className="text-[18px] font-semibold text-ink">No groups yet</h3>
          <p className="mt-1.5 max-w-sm text-[14px] text-slate-600">Start one for a trip or your flat, or ask a friend for their group's one-time code.</p>
        </div>
      ) : (
        <div className="scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 sm:px-3">
          {editing ? (
            <>
              <p className="px-3 pb-1 text-[12px] text-slate-500">Drag to reorder. Pinned groups stay on top. Archiving only hides a group from your list.</p>
              <SortableSection label={pinned.length ? 'Pinned' : null} items={pinned} me={me} onMove={(a, b) => reorder('pinned', a, b)} onPin={pin} onArchive={(g) => archive(g, true)} />
              <SortableSection label={pinned.length && others.length ? 'Groups' : null} items={others} me={me} onMove={(a, b) => reorder('others', a, b)} onPin={pin} onArchive={(g) => archive(g, true)} />
            </>
          ) : (
            <ul className="divide-y divide-surface-border">
              {[...pinned, ...others].map((g) => (
                <GroupRow key={g.id} group={g} isMine={g.owner_id === me} />
              ))}
            </ul>
          )}
          {active === 0 && <p className="px-3 py-6 text-center text-[14px] text-slate-500">Every group is archived.</p>}

          {archived.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-expanded={showArchived}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-500 hover:bg-surface-elevated/70 hover:text-ink"
              >
                <Icon name="archive" className="h-4 w-4" />
                Archived · {archived.length}
                <Icon name="chevron" className={`ml-auto h-4 w-4 transition-transform duration-300 ease-ios ${showArchived ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              {showArchived && (
                <ul className="divide-y divide-surface-border">
                  {archived.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      dim
                      isMine={g.owner_id === me}
                      action={
                        <button
                          type="button"
                          onClick={() => archive(g, false)}
                          aria-label={`Unarchive ${g.name}`}
                          title="Unarchive"
                          className={`${iconButton} ml-1 text-slate-400 hover:bg-brand-500/10 hover:text-brand-600`}
                        >
                          <Icon name="archive" className="h-4 w-4" />
                        </button>
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
