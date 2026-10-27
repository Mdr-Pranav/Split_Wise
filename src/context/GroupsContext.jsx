import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';

const GroupsContext = createContext(null);
const EVENT = 'groups-changed';

// Call after creating, renaming, leaving, deleting or handing over a group
export function notifyGroupsChanged() {
  window.dispatchEvent(new Event(EVENT));
}

// The user's groups, shared by the header's group switcher and Home
export function GroupsProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [groups, setGroups] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId) return setGroups(null);
    try {
      setGroups(await api.myGroups());
    } catch {
      setGroups((g) => g ?? []);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener(EVENT, refresh);
    // Payments change each group's balance on Home
    window.addEventListener('payments-changed', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('payments-changed', refresh);
    };
  }, [refresh]);

  return <GroupsContext.Provider value={{ groups, refresh }}>{children}</GroupsContext.Provider>;
}

export function useGroups() {
  return useContext(GroupsContext);
}
