import { useMemo, useState, type FormEvent } from 'react';
import { grantAdmin, revokeAdmin } from '../lib/api';
import type { Permissions, TreeIndex } from '../lib/tree';
import type { AdminGrant, Profile } from '../lib/types';
import { Modal } from './ui';

const WHOLE_TREE = '__whole_tree__';

export function AdminDialog({
  familyId,
  index,
  admins,
  profiles,
  permissions,
  initialScope,
  onChanged,
  onClose,
}: {
  familyId: string;
  index: TreeIndex;
  admins: AdminGrant[];
  profiles: Profile[];
  permissions: Permissions;
  /** Person whose branch is pre-selected, or null for the whole tree. */
  initialScope: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [scope, setScope] = useState(initialScope ?? (permissions.isSuperAdmin ? WHOLE_TREE : permissions.branchRoots[0] ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const profileName = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? `${p.display_name} (${p.email})` : 'Unknown user';
  };

  // Branches this user is allowed to hand out.
  const scopeOptions = useMemo(
    () =>
      [...index.byId.values()]
        .filter((p) => permissions.canEdit(p.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [index, permissions],
  );

  const visibleGrants = admins
    .filter((g) => permissions.canManageGrant(g))
    .sort((a, b) => (a.scope_person_id === null ? -1 : b.scope_person_id === null ? 1 : 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await grantAdmin(familyId, userId, scope === WHOLE_TREE ? null : scope);
      setUserId('');
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes('duplicate') ? 'That person is already an admin there.' : message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (grant: AdminGrant) => {
    if (!confirm(`Remove ${profileName(grant.user_id)} as admin?`)) return;
    try {
      await revokeAdmin(grant.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal title="Administrators" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <label>
          Family member’s account
          <select required value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a family member…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name} — {p.email}</option>
            ))}
          </select>
        </label>
        <label>
          Admin of
          <select required value={scope} onChange={(e) => setScope(e.target.value)}>
            {permissions.isSuperAdmin && <option value={WHOLE_TREE}>The whole tree (1st-level admin)</option>}
            {scopeOptions.map((p) => (
              <option key={p.id} value={p.id}>Branch of {p.name} (2nd-level admin)</option>
            ))}
          </select>
        </label>
        <p className="hint">
          1st-level admins can edit anything and appoint admins anywhere. 2nd-level admins can edit and appoint admins only
          within their branch (that person and all their descendants).
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy || !userId || !scope}>
            {busy ? 'Saving…' : 'Make admin'}
          </button>
        </div>
      </form>

      <h3 className="subhead">Current admins you manage</h3>
      {visibleGrants.length === 0 && <p className="muted">None yet.</p>}
      <ul className="admin-list">
        {visibleGrants.map((g) => (
          <li key={g.id}>
            <span>
              <strong>{profileName(g.user_id)}</strong>
              <small>
                {g.scope_person_id === null
                  ? '1st level · whole tree'
                  : `2nd level · branch of ${index.byId.get(g.scope_person_id)?.name ?? 'unknown'}`}
              </small>
            </span>
            <button type="button" className="button button-ghost" onClick={() => revoke(g)}>Remove</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
