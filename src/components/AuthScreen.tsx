import { useState, type FormEvent } from 'react';
import { supabase } from '../utils/supabase';
import { Icon } from './ui';

type Mode = 'signin' | 'signup' | 'link';

export function AuthScreen({ onStartSetup }: { onStartSetup: () => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setNotice('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice('We sent a sign-in link to your email.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="tree" size={26} /></span>
          <div>
            <h1>Family Tree</h1>
            <p>Sign in to see and grow your family’s story.</p>
          </div>
        </div>

        <button type="button" className="setup-cta" onClick={onStartSetup}>
          <span className="setup-cta-text">
            <strong>New here? Set up your family’s tree</strong>
            <small>Create an account, add the first branches and invite relatives — about 3 minutes.</small>
          </span>
          <Icon name="forward" size={18} />
        </button>

        <div className="auth-divider"><span>or, if you have an account or invite</span></div>

        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => switchMode('signin')}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} onClick={() => switchMode('signup')}>Sign up</button>
          <button type="button" role="tab" aria-selected={mode === 'link'} onClick={() => switchMode('link')}>Email link</button>
        </div>

        <form className="form" onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Your name
              <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode !== 'link' && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </label>
          )}
          {mode === 'link' && <p className="muted">No password needed — we’ll email you a one-time sign-in link.</p>}
          {error && <p className="form-error">{error}</p>}
          {notice && <p className="form-notice">{notice}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send link'}
          </button>
        </form>
      </div>
    </div>
  );
}
