import { SignOutButton } from '@clerk/react';
import { useEffect, useState, type FormEvent } from 'react';
import { fetchInviteCode, publicTreeUrl, regenerateInvite, regeneratePublicLink, removeMember, renameFamily, setPublicSharing } from '../lib/api';
import { AUTH_DISABLED } from '../lib/demo';
import type { Permissions } from '../lib/tree';
import type { AdminGrant, Family, Member } from '../lib/types';
import { Icon, Modal } from './ui';

export function FamilyDialog({
  me,
  family,
  families,
  members,
  admins,
  permissions,
  onSwitch,
  onAddFamily,
  onChanged,
  onClose,
}: {
  me: string;
  family: Family;
  families: Family[];
  members: Member[];
  admins: AdminGrant[];
  permissions: Permissions;
  onSwitch: (familyId: string) => void;
  onAddFamily: () => void;
  /** Called after anything that changes families or membership. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [name, setName] = useState(family.name);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!permissions.isAnyAdmin) return;
    fetchInviteCode(family.id).then(setCode).catch(() => setCode(null));
  }, [family.id, permissions.isAnyAdmin]);

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));
  const inviteLink = code ? `${window.location.origin}${window.location.pathname}?join=${code}` : '';

  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? inviteLink : code!);
      setCopied(what);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('Could not copy — select the text and copy it manually.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: family.name, text: `Join ${family.name} on Family Tree (code ${code})`, url: inviteLink });
    } catch {
      // Share sheet dismissed.
    }
  };

  const newCode = async () => {
    if (!confirm('Make a new invite code? The current code and link will stop working.')) return;
    try {
      setCode(await regenerateInvite(family.id));
    } catch (err) {
      fail(err);
    }
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await renameFamily(family.id, name);
      onChanged();
    } catch (err) {
      fail(err);
    }
  };

  const ownerCount = new Set(admins.filter((a) => a.scope_person_id === null).map((a) => a.user_id)).size;
  const lastOwner = permissions.isSuperAdmin && ownerCount <= 1;

  const remove = async (member: Member) => {
    const self = member.id === me;
    const question = self
      ? `Leave ${family.name}? You’ll need a new invite to rejoin.`
      : `Remove ${member.display_name} from ${family.name}? They will lose access and any admin rights here.`;
    if (!confirm(question)) return;
    try {
      await removeMember(family.id, member.id);
      onChanged();
      if (self) onClose();
    } catch (err) {
      fail(err);
    }
  };

  const roleOf = (userId: string) => {
    const grants = admins.filter((a) => a.user_id === userId);
    if (grants.some((g) => g.scope_person_id === null)) return '1st-level admin';
    if (grants.length) return 'Branch admin';
    return '';
  };

  return (
    <Modal title="Family" onClose={onClose}>
      <section>
        <h3 className="subhead first">Your families</h3>
        <ul className="family-list">
          {families.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`family-item ${f.id === family.id ? 'is-current' : ''}`}
                onClick={() => (f.id === family.id ? onClose() : onSwitch(f.id))}
              >
                <span className="family-initial" aria-hidden="true">{f.name.replace(/^the\s+/i, '').slice(0, 1).toUpperCase()}</span>
                <span className="family-item-name">{f.name}</span>
                {f.id === family.id && <span className="pill">Current</span>}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="button button-secondary full" onClick={onAddFamily}>
          <Icon name="plus" size={18} /> Create or join another family
        </button>
      </section>

      {code && (
        <section>
          <h3 className="subhead">Invite relatives to {family.name}</h3>
          <div className="invite-box">
            <span className="invite-code" aria-label="Invite code">{code}</span>
            <div className="invite-actions">
              {typeof navigator.share === 'function' && (
                <button type="button" className="button button-primary" onClick={share}>Share invite</button>
              )}
              <button type="button" className="button button-secondary" onClick={() => copy('link')}>
                {copied === 'link' ? 'Copied!' : 'Copy link'}
              </button>
              <button type="button" className="button button-secondary" onClick={() => copy('code')}>
                {copied === 'code' ? 'Copied!' : 'Copy code'}
              </button>
              <button type="button" className="button button-ghost" onClick={newCode}>New code</button>
            </div>
          </div>
          <p className="hint">Anyone with this code can join and see the tree and chat. Joining doesn’t make them an admin.</p>
        </section>
      )}

      <PublicLinkSection family={family} canManage={permissions.isSuperAdmin} onChanged={onChanged} onError={setError} />

      {permissions.isSuperAdmin && (
        <section>
          <h3 className="subhead">Family name</h3>
          <form className="inline-form" onSubmit={rename}>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="Family name" />
            <button type="submit" className="button button-secondary" disabled={!name.trim() || name.trim() === family.name}>Save</button>
          </form>
        </section>
      )}

      <section>
        <h3 className="subhead">Members ({members.length})</h3>
        <ul className="admin-list">
          {members.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.display_name}{m.id === me && ' (you)'}</strong>
                <small>{[m.email, roleOf(m.id)].filter(Boolean).join(' · ')}</small>
              </span>
              {m.id !== me && permissions.isSuperAdmin && (
                <button type="button" className="button button-ghost" onClick={() => remove(m)}>Remove</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {error && <p className="form-error">{error}</p>}

      <div className="family-footer">
        <button
          type="button"
          className="button button-danger"
          onClick={() => remove(members.find((m) => m.id === me)!)}
          disabled={lastOwner || !members.some((m) => m.id === me)}
          title={lastOwner ? 'Make someone else a 1st-level admin before leaving' : undefined}
        >
          Leave family
        </button>
        {!AUTH_DISABLED && (
          <SignOutButton>
            <button type="button" className="button button-ghost">
              <Icon name="logout" size={16} /> Sign out
            </button>
          </SignOutButton>
        )}
      </div>
      {lastOwner && <p className="hint">You’re the only 1st-level admin. Appoint another before leaving.</p>}
    </Modal>
  );
}

function PublicLinkSection({ family, canManage, onChanged, onError }: {
  family: Family;
  canManage: boolean;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [enabled, setEnabled] = useState(Boolean(family.is_public));
  const [hideLiving, setHideLiving] = useState(family.public_hide_living ?? true);
  const [slug, setSlug] = useState(family.public_slug ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = slug ? publicTreeUrl(slug) : '';

  // Members who can't manage sharing only see the link once it's on.
  if (!canManage && !enabled) return null;

  const save = async (nextEnabled: boolean, nextHide: boolean) => {
    if (nextEnabled && !nextHide && !confirm('Anyone with the link will see photos, birth dates and stories of living relatives. Continue?')) return;
    setBusy(true);
    try {
      setSlug(await setPublicSharing(family.id, nextEnabled, nextHide));
      setEnabled(nextEnabled);
      setHideLiving(nextHide);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const newLink = async () => {
    if (!confirm('Make a new public link? Anyone using the current link will lose access.')) return;
    try {
      setSlug(await regeneratePublicLink(family.id));
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onError('Could not copy — select the link and copy it manually.');
    }
  };

  return (
    <section>
      <h3 className="subhead">Public link</h3>
      {canManage && (
        <label className="switch-row">
          <span>
            <strong>Let anyone with the link view the tree</strong>
            <small>Visitors don’t need an account. They can’t edit, chat or see the invite code.</small>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={enabled} disabled={busy}
            onChange={(e) => save(e.target.checked, hideLiving)} />
        </label>
      )}
      {enabled && url && (
        <>
          <div className="public-link">
            <input readOnly value={url} aria-label="Public link" onFocus={(e) => e.target.select()} />
            <button type="button" className="button button-secondary" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
            <a className="button button-ghost" href={url} target="_blank" rel="noreferrer">Open</a>
          </div>
          {canManage ? (
            <>
              <label className="checkbox privacy-toggle">
                <input type="checkbox" checked={hideLiving} disabled={busy} onChange={(e) => save(true, e.target.checked)} />
                Hide details of living relatives (recommended)
              </label>
              <p className="hint">
                {hideLiving
                  ? 'Living relatives appear by name only — no photos, dates or write-ups.'
                  : 'Visitors can see photos, birth dates and write-ups of living relatives.'}{' '}
                <button type="button" className="link" onClick={newLink}>New link</button> stops the old one working.
              </p>
            </>
          ) : (
            <p className="hint">Shared publicly by a 1st-level admin{hideLiving ? '. Living relatives appear by name only.' : '.'}</p>
          )}
        </>
      )}
    </section>
  );
}
