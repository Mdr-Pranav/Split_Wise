import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGroups } from '../context/GroupsContext';
import Logo from './Logo';
import Icon from './Icon';
import Avatar from './Avatar';
import ThemeToggle from './ThemeToggle';
import DemoBar from './DemoBar';
import NotificationBell from './NotificationBell';

const navItems = [
  { to: '/join', label: 'Join a group', icon: 'key' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const MORPH = 'transition-[max-width,opacity,transform,margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none';

// Header nav. On a group page it morphs: Join and Settings fold away and
// the user's groups unfold as chips, with the active pill gliding between them.
export default function Layout({ children }) {
  const { user, name, signOut } = useAuth();
  const { groups, refresh } = useGroups();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const navListRef = useRef(null);
  // Position of the sliding active pill; it only animates after the first placement
  const [pill, setPill] = useState(null);
  const [pillReady, setPillReady] = useState(false);

  const groupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null;
  const inGroup = Boolean(groupId);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // A group the header doesn't know yet (just created or joined)
  useEffect(() => {
    if (groupId && groups && !groups.some((g) => g.id === groupId)) refresh();
  }, [groupId, groups, refresh]);

  // Keep the pill under the active item while chips grow and shrink
  useLayoutEffect(() => {
    const list = navListRef.current;
    if (!list) return;
    const update = () => {
      const active = list.querySelector('a[aria-current="page"]');
      if (!active) return setPill(null);
      // Rects, not offsetLeft: the chips' slide-in transform makes each <li> its own offset parent
      const a = active.getBoundingClientRect();
      const l = list.getBoundingClientRect();
      setPill({ left: a.left - l.left + list.scrollLeft, top: a.top - l.top, width: a.width, height: a.height });
    };
    update();
    const observer = new ResizeObserver(update);
    list.querySelectorAll('li, a').forEach((el) => observer.observe(el));
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [pathname, groups]);

  // Bring the active group chip into view when the switcher overflows
  useEffect(() => {
    const list = navListRef.current;
    const active = list?.querySelector('a[aria-current="page"]');
    if (!list || !active || !inGroup) return;
    const timer = setTimeout(() => {
      const left = active.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
      list.scrollTo({ left: left - (list.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
    }, 350);
    return () => clearTimeout(timer);
  }, [pathname, inGroup, groups]);

  useEffect(() => {
    if (!pill || pillReady) return;
    const frame = requestAnimationFrame(() => setPillReady(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, pillReady]);

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
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 [transform:translateZ(0)] sm:px-4 sm:pt-4">
        <nav
          aria-label="Main"
          className="relative mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-1 rounded-full pl-2.5 pr-1.5 glass sm:h-16 sm:gap-2 sm:pl-5 sm:pr-2"
        >
          <NavLink to="/" className="flex flex-shrink-0 select-none items-center gap-2" aria-label="Split Wise home">
            <Logo className="h-7 w-7" />
            <span className="hidden text-[17px] font-semibold tracking-[-0.03em] text-ink md:inline">Split Wise</span>
          </NavLink>

          <ul
            ref={navListRef}
            className="relative flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] sm:gap-1 lg:absolute lg:left-1/2 lg:max-w-[calc(100%-27rem)] lg:-translate-x-1/2 [&::-webkit-scrollbar]:hidden"
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute left-0 top-0 rounded-full bg-gradient-to-b from-brand-500 to-brand-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_20px_-8px_rgb(var(--brand-500)/0.75)] ${
                pillReady ? 'transition-[transform,width,height,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none' : ''
              }`}
              style={{
                width: pill?.width ?? 0,
                height: pill?.height ?? 0,
                transform: `translate(${pill?.left ?? 0}px, ${pill?.top ?? 0}px)`,
                opacity: pill ? 1 : 0,
              }}
            />
            <li className="flex-shrink-0">
              <NavLink to="/" end aria-label="Home" title="Home" className={iconLink}>
                <Icon name="home" className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </NavLink>
            </li>

            {navItems.map((item) => (
              <li
                key={item.to}
                aria-hidden={inGroup}
                className={`flex-shrink-0 overflow-hidden ${MORPH} ${inGroup ? 'pointer-events-none max-w-0 scale-75 opacity-0' : 'max-w-[48px] opacity-100'}`}
              >
                <NavLink to={item.to} aria-label={item.label} title={item.label} tabIndex={inGroup ? -1 : undefined} className={iconLink}>
                  <Icon name={item.icon} className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
                </NavLink>
              </li>
            ))}

            <li aria-hidden="true" className={`flex-shrink-0 ${MORPH} ${inGroup ? 'mx-1 h-5 w-px max-w-[1px] bg-line/15 opacity-100' : 'max-w-0 opacity-0'}`} />

            {(groups || []).map((g, i) => {
              const active = g.id === groupId;
              return (
                <li
                  key={g.id}
                  aria-hidden={!inGroup}
                  className={`flex-shrink-0 overflow-hidden ${MORPH} ${inGroup ? 'max-w-[13rem] opacity-100' : 'pointer-events-none max-w-0 opacity-0'}`}
                  style={{ transitionDelay: inGroup ? `${60 + i * 40}ms` : '0ms' }}
                >
                  <NavLink
                    to={`/groups/${g.id}`}
                    title={g.name}
                    tabIndex={inGroup ? undefined : -1}
                    className={({ isActive }) =>
                      `relative flex h-10 items-center gap-2 whitespace-nowrap rounded-full pl-1 pr-1 text-[14px] font-medium transition-colors duration-300 sm:h-11 sm:pl-1.5 sm:pr-3.5 ${
                        isActive ? 'text-white' : 'text-slate-600 hover:bg-surface-elevated hover:text-ink'
                      }`
                    }
                  >
                    <Avatar id={g.id} name={g.name} size="sm" className={active ? '!ring-white/40' : ''} />
                    {/* Phones: only the open group shows its name; the rest stay as initials */}
                    <span className={`max-w-[9rem] truncate ${MORPH} ${active ? 'max-sm:max-w-[7.5rem] max-sm:pr-2.5' : 'max-sm:max-w-0 max-sm:opacity-0'}`}>
                      {g.name}
                    </span>
                  </NavLink>
                </li>
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

      <main className="px-4 pb-8 pt-24 sm:px-6 sm:pt-28">
        <div key={pathname} className="page-enter mx-auto max-w-[1120px]">
          {children}
        </div>
      </main>

      <DemoBar />
    </div>
  );
}
