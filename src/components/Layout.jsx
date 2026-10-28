import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import Logo from './Logo';
import { APP_NAME } from '../lib/brand';
import Icon from './Icon';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import DemoBar from './DemoBar';
import NotificationBell from './NotificationBell';

const navItems = [
  { to: '/join', label: 'Join a group', icon: 'key' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

// How "deep" a screen is, for iOS-style push / pop page transitions
const depthOf = (path) => (path === '/' ? 0 : path.startsWith('/groups/') ? 2 : 1);

// Header morph timing: slow and smooth, with a gentle ease-in-out so items
// neither lurch at the start nor snap at the end
const MORPH_MS = 800;
const MORPH_EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
// Stiffness of the pill's spring (rad/s). Critically damped: it starts from
// rest, accelerates gently and settles without bouncing, like iOS.
const PILL_OMEGA = 8.5;

// A nav item that animates its *real* width between 0 and its natural size
// (grid 0fr ↔ 1fr), so items grow and shrink evenly instead of stalling the
// way a max-width animation does.
function Fold({ open, delay = 0, className = '', children }) {
  return (
    <li
      aria-hidden={!open}
      className={`grid flex-shrink-0 transition-[grid-template-columns,opacity] motion-reduce:transition-none ${
        open ? 'grid-cols-[1fr] opacity-100' : 'pointer-events-none grid-cols-[0fr] opacity-0'
      } ${className}`}
      style={{ transitionDuration: `${MORPH_MS}ms`, transitionTimingFunction: MORPH_EASE, transitionDelay: `${delay}ms` }}
    >
      <div className="min-w-0 overflow-hidden">{children}</div>
    </li>
  );
}

// Header nav. On a group page it morphs: Join and Settings fold away and
// the user's groups unfold as chips, with the active pill gliding between them.
export default function Layout({ children }) {
  const { user, name, signOut } = useAuth();
  const { groups, refresh } = useGroups();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navListRef = useRef(null);
  const pillRef = useRef(null);
  const glide = useRef({ pos: null, vel: null, raf: 0, until: 0 });

  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Deeper screen slides in from the right, shallower from the left,
  // same level (e.g. switching groups) cross-fades
  const lastPath = useRef(pathname);
  const pageAnim = useRef('page-fade');
  if (lastPath.current !== pathname) {
    const from = depthOf(lastPath.current);
    const to = depthOf(pathname);
    pageAnim.current = to > from ? 'page-push' : to < from ? 'page-pop' : 'page-fade';
    lastPath.current = pathname;
  }

  const groupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null;
  const inGroup = Boolean(groupId);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // A group the header doesn't know yet (just created or joined)
  useEffect(() => {
    if (groupId && groups && !groups.some((g) => g.id === groupId)) refresh();
  }, [groupId, groups, refresh]);

  // The pill rides a spring toward the active item every frame while the
  // header morphs (its target keeps moving as chips grow), instead of
  // restarting a CSS transition on each layout change.
  useEffect(() => {
    const state = glide.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let last = performance.now();

    const tick = (now) => {
      const list = navListRef.current;
      const el = pillRef.current;
      const dt = Math.min(64, now - last);
      last = now;
      if (!list || !el) return;
      const active = list.querySelector('a[aria-current="page"]');
      if (!active) {
        el.style.opacity = '0';
        state.pos = null;
      } else {
        // Rects, not offsetLeft: folding items change offset parents mid-morph
        const a = active.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        // Never narrower than a circle, so it can't collapse to a sliver
        // while the destination chip is still unfolding
        const w = Math.max(a.width, a.height);
        const target = { x: a.left - l.left + list.scrollLeft + (a.width - w) / 2, y: a.top - l.top, w, h: a.height };
        if (!state.pos || reduced) {
          state.pos = target;
          state.vel = { x: 0, y: 0, w: 0, h: 0 };
        } else {
          // Semi-implicit Euler on a critically damped spring
          const s = dt / 1000;
          for (const key of ['x', 'y', 'w', 'h']) {
            const accel = PILL_OMEGA * PILL_OMEGA * (target[key] - state.pos[key]) - 2 * PILL_OMEGA * state.vel[key];
            state.vel[key] += accel * s;
            state.pos[key] += state.vel[key] * s;
          }
        }
        const p = state.pos;
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.style.width = `${p.w}px`;
        el.style.height = `${p.h}px`;
        el.style.opacity = '1';
        const settled = Math.abs(target.x - p.x) + Math.abs(target.w - p.w) < 0.3 && Math.abs(state.vel.x) + Math.abs(state.vel.w) < 2;
        if (settled && now > state.until) {
          state.raf = 0;
          return;
        }
      }
      state.raf = requestAnimationFrame(tick);
    };

    // Keep gliding for the whole morph, then stop once settled
    const kick = () => {
      state.until = performance.now() + MORPH_MS + 600;
      if (!state.raf) {
        last = performance.now();
        state.raf = requestAnimationFrame(tick);
      }
    };
    kick();
    window.addEventListener('resize', kick);
    return () => {
      window.removeEventListener('resize', kick);
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    };
  }, [pathname, groups]);

  // Bring the active group chip into view when the switcher overflows
  useEffect(() => {
    const list = navListRef.current;
    const active = list?.querySelector('a[aria-current="page"]');
    if (!list || !active || !inGroup) return;
    const timer = setTimeout(() => {
      if (list.scrollWidth <= list.clientWidth) return;
      const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
      list.scrollTo({ left: left - (list.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
    }, MORPH_MS);
    return () => clearTimeout(timer);
  }, [pathname, inGroup, groups]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const iconLink = ({ isActive }) =>
    `relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-300 sm:h-11 sm:w-11 ${
      isActive ? 'text-white' : 'text-slate-500 hover:bg-surface-elevated hover:text-ink'
    }`;

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] [transform:translateZ(0)] sm:px-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
        <nav
          aria-label="Main"
          className="relative mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-1 rounded-full pl-2.5 pr-1.5 glass sm:h-16 sm:gap-2 sm:pl-5 sm:pr-2"
        >
          <NavLink to="/" className="flex flex-shrink-0 select-none items-center gap-2" aria-label={`${APP_NAME} home`}>
            <Logo className="h-7 w-7" />
            <span className="hidden text-[17px] font-semibold tracking-[-0.03em] text-ink md:inline">{APP_NAME}</span>
          </NavLink>

          <ul
            ref={navListRef}
            className="relative -my-3 flex min-w-0 items-center overflow-x-auto py-3 [scrollbar-width:none] lg:absolute lg:left-1/2 lg:max-w-[calc(100%-27rem)] lg:-translate-x-1/2 [&::-webkit-scrollbar]:hidden"
          >
            <span ref={pillRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 rounded-full bg-brand-500 opacity-0 shadow-[0_6px_18px_-4px_rgb(var(--brand-500)/0.6)]" />
            <li className="flex-shrink-0 sm:px-0.5">
              <NavLink to="/" end aria-label="Home" title="Home" className={iconLink}>
                <Icon name="home" className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </NavLink>
            </li>

            {/* Join and Settings fold away inside a group (after the chips leave when going home) */}
            {navItems.map((item, i) => (
              <Fold key={item.to} open={!inGroup} delay={inGroup ? i * 40 : 180 + i * 60}>
                <div className="sm:px-0.5">
                  <NavLink to={item.to} aria-label={item.label} title={item.label} tabIndex={inGroup ? -1 : undefined} className={iconLink}>
                    <Icon name={item.icon} className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                  </NavLink>
                </div>
              </Fold>
            ))}

            <Fold open={inGroup} delay={inGroup ? 80 : 60}>
              <div className="flex h-10 items-center px-1.5 sm:h-11">
                <span className="h-5 w-px bg-[rgb(var(--line)/0.18)]" />
              </div>
            </Fold>

            {/* The group being opened unfolds first, the rest follow one by one */}
            {(groups || []).map((g, i) => {
              const active = g.id === groupId;
              return (
                <Fold key={g.id} open={inGroup} delay={inGroup ? (active ? 40 : 160 + i * 60) : i * 30}>
                  <div className="sm:px-0.5">
                    <NavLink
                      to={`/groups/${g.id}`}
                      title={g.name}
                      tabIndex={inGroup ? undefined : -1}
                      className={({ isActive }) =>
                        `relative flex h-10 items-center whitespace-nowrap rounded-full pl-1 pr-1 text-[14px] font-medium transition-colors duration-500 sm:h-11 sm:pl-1.5 sm:pr-3.5 ${
                          isActive ? 'text-white' : 'text-slate-600 hover:bg-surface-elevated hover:text-ink'
                        }`
                      }
                    >
                      <Avatar id={g.id} name={g.name} size="sm" className={active ? '!ring-white/40' : ''} />
                      {/* Phones: only the open group shows its name; it slides open when you switch */}
                      <span
                        className={`grid transition-[grid-template-columns,opacity] sm:grid-cols-[1fr] sm:opacity-100 ${
                          active ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'
                        }`}
                        style={{ transitionDuration: `${MORPH_MS}ms`, transitionTimingFunction: MORPH_EASE }}
                      >
                        <span className="min-w-0 overflow-hidden">
                          <span className="block max-w-[9rem] truncate pl-2 pr-2.5 max-sm:max-w-[7.5rem] sm:pr-0">{g.name}</span>
                        </span>
                      </span>
                    </NavLink>
                  </div>
                </Fold>
              );
            })}
          </ul>

          <div className="flex flex-shrink-0 items-center sm:gap-1">
            <NotificationBell />
            <ThemeToggle />
            <NavLink to="/settings" aria-label="Your profile" title={name} className="mx-0.5 rounded-full transition-transform hover:scale-105">
              <Avatar id={user?.id} name={name} className="sm:h-10 sm:w-10 sm:text-[14px]" />
            </NavLink>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-surface-elevated hover:text-ink sm:inline-flex"
            >
              <Icon name="logout" />
            </button>
          </div>
        </nav>
      </header>

      {offline && (
        <div role="status" className="fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-30 flex justify-center px-4 sm:top-[calc(5.5rem+env(safe-area-inset-top))]">
          <span className="glass rounded-full px-3.5 py-1.5 text-[12px] font-medium text-amber-600">
            You’re offline. Changes will need a connection.
          </span>
        </div>
      )}

      <main className="px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[calc(6rem+env(safe-area-inset-top))] sm:px-6 sm:pt-[calc(7rem+env(safe-area-inset-top))]">
        <div key={pathname} className={`${pageAnim.current} mx-auto max-w-[1120px]`}>
          {children}
        </div>
      </main>

      <DemoBar />
    </div>
  );
}
