import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { notifyPaymentsChanged } from '../context/InboxContext';
import { notifyGroupsChanged } from '../context/GroupsContext';
import { api } from '../lib/api';
import { flush, onOutboxChange, queued } from '../lib/outbox';

// Expenses saved offline that haven't reached the server yet
export function useOutbox(groupId) {
  const { user } = useAuth();
  const [items, setItems] = useState(() => queued(user?.id, groupId));
  useEffect(() => {
    const update = () => setItems(queued(user?.id, groupId));
    update();
    return onOutboxChange(update);
  }, [user?.id, groupId]);
  return items;
}

// Sends them when the app opens and whenever the connection comes back
export function useOutboxSync() {
  const { user } = useAuth();
  const toast = useToast();
  useEffect(() => {
    if (!user) return;
    const run = async () => {
      const { sent, failed } = await flush(user.id, api.saveExpense);
      if (sent) {
        toast.success(`${sent} offline expense${sent === 1 ? '' : 's'} synced`);
        notifyGroupsChanged();
        notifyPaymentsChanged();
      }
      if (failed) toast.error(`${failed} offline expense${failed === 1 ? '' : 's'} couldn’t be saved. Open the group to see why.`);
    };
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [user, toast]);
}
