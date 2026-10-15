import { SignOutButton } from '@clerk/react';
import { useState, type FormEvent } from 'react';
import { joinFamily } from '../lib/api';
import { AUTH_DISABLED, DEMO_JOIN_CODE } from '../lib/demo';
import { Icon } from './ui';

export function Onboarding({
  initialCode,
  canCancel,
  onStartSetup,
  onDone,
  onCancel,
}: {
  initialCode: string;
  canCancel: boolean;
  /** Opens the guided setup wizard for a new family. */
  onStartSetup: () => void;
  onDone: (familyId: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const join = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone(await joinFamily(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="onboarding">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="tree" size={26} /></span>
          <div>
            <h1>{canCancel ? 'Add a family' : 'Welcome to Family Tree'}</h1>
            <p>Start your own family’s tree, or join one a relative has already set up.</p>
          </div>
        </div>

        <div className="onboarding-grid">
          <div className="onboarding-card form">
            <div>
              <h2>Start a new family tree</h2>
              <p className="muted">Set it up on behalf of your family. You’ll be its first administrator.</p>
            </div>
            <ol className="setup-outline">
              <li>Name your family tree</li>
              <li>Add the oldest ancestor you know</li>
              <li>Add their children</li>
              <li>Invite relatives</li>
            </ol>
            <button className="button button-primary" type="button" onClick={onStartSetup}>
              Set up a family tree <Icon name="forward" size={16} />
            </button>
          </div>

          <form className="onboarding-card form" onSubmit={join}>
            <div>
              <h2>Join your family</h2>
              <p className="muted">Ask a family admin for the invite code or link.</p>
            </div>
            <label>
              Invite code
              <input
                required
                className="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="ABCD1234"
                maxLength={12}
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus={Boolean(initialCode)}
              />
            </label>
            {AUTH_DISABLED && <p className="hint">Demo: try the code <strong>{DEMO_JOIN_CODE}</strong>.</p>}
            {error && <p className="form-error">{error}</p>}
            <button className="button button-secondary" type="submit" disabled={busy || !code.trim()}>
              {busy ? 'Joining…' : 'Join family'}
            </button>
          </form>
        </div>

        <div className="onboarding-footer">
          {canCancel && (
            <button type="button" className="button button-ghost" onClick={onCancel}>
              <Icon name="back" size={16} /> Back to my tree
            </button>
          )}
          {AUTH_DISABLED && (
            <a className="button button-ghost" href="?setup">Demo: preview the full sign-up flow</a>
          )}
          {!AUTH_DISABLED && (
            <SignOutButton>
              <button type="button" className="button button-ghost">
                <Icon name="logout" size={16} /> Sign out
              </button>
            </SignOutButton>
          )}
        </div>
      </div>
    </div>
  );
}
