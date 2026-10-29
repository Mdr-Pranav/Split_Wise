import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { rememberLooks } from '../lib/avatars';

const InboxContext = createContext(null);
const POLL_MS = 30000;
const EVENT = 'payments-changed';

// Any screen that records, confirms or withdraws a payment calls this so the
// bell and open group pages refresh.
export function notifyPaymentsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

export function usePaymentsChanged(callback) {
  useEffect(() => {
    window.addEventListener(EVENT, callback);
    return () => window.removeEventListener(EVENT, callback);
  }, [callback]);
}

// The bell: payments other people sent the user to confirm, and reminders
// (nudges) from people the user owes
export function InboxProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [items, setItems] = useState([]);
  const [nudges, setNudges] = useState([]);
  const [smart, setSmart] = useState([]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setNudges([]);
      setSmart([]);
      return;
    }
    try {
      const [payments, reminders, tasks] = await Promise.all([api.pendingPayments(), api.myNudges(), api.mySmartTasks()]);
      setItems(payments);
      setNudges(reminders);
      setSmart(tasks);
      rememberLooks([...payments, ...reminders].map((x) => [x.from_user, x.from_emoji, x.from_color]));
    } catch {
      // keep the last list; the next poll will retry
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const timer = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, userId]);

  usePaymentsChanged(refresh);

  return <InboxContext.Provider value={{ items, nudges, smart, refresh }}>{children}</InboxContext.Provider>;
}

export function useInbox() {
  return useContext(InboxContext);
}
