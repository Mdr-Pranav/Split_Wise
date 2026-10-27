import { useState } from 'react';
import Modal from './Modal';
import { ErrorNote } from './AuthShell';
import { api } from '../lib/api';
import { notifyGroupsChanged } from '../context/GroupsContext';
import { CURRENCIES } from '../lib/money';

export default function CreateGroupModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const id = await api.createGroup(name.trim(), currency);
      setName('');
      notifyGroupsChanged();
      onCreated(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="create-group-title">
      <form onSubmit={submit} className="space-y-5">
        <div className="pr-10">
          <h2 id="create-group-title" className="text-[22px] font-semibold text-ink">New group</h2>
          <p className="mt-1 text-[14px] text-slate-600">You'll be the owner. Only you can let people in.</p>
        </div>
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label htmlFor="group-name" className="label">Group name</label>
          <input id="group-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Goa trip, Flat 302, Office lunch…" />
        </div>
        <div>
          <label htmlFor="group-currency" className="label">Currency</label>
          <select id="group-currency" className="input-field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary h-12 w-full" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
      </form>
    </Modal>
  );
}
