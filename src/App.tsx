import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import './App.css';
import { AuthScreen } from './components/AuthScreen';
import { FamilyGate } from './components/FamilyGate';
import { PublicTreePage } from './components/PublicTreePage';
import { SetupWizard } from './components/SetupWizard';
import { AUTH_DISABLED, demoSession } from './lib/demo';
import { hasUrlFlag, removeUrlFlag, writeLastFamily } from './lib/setup';
import { supabase } from './utils/supabase';

/** Public share links look like https://site/?tree=okafor-7k2p9qrx */
const publicSlug = new URLSearchParams(window.location.search).get('tree');

function App() {
  const [session, setSession] = useState<Session | null | undefined>(AUTH_DISABLED ? demoSession : undefined);
  // Guided sign-up + family setup, started from the sign-in screen or a ?setup link.
  const [setup, setSetup] = useState(() => hasUrlFlag('setup'));
  const [setupNeedsAccount, setSetupNeedsAccount] = useState<boolean | null>(null);

  useEffect(() => {
    if (AUTH_DISABLED) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Decide once, when setup starts, whether it begins with the account step. It must not
  // change mid-flow: signing up creates a session while the wizard is still open.
  if (setup && session !== undefined && setupNeedsAccount === null) {
    setSetupNeedsAccount(AUTH_DISABLED || !session);
  }

  // Public pages need no login, so they don't wait for the session either.
  if (publicSlug) return <PublicTreePage slug={publicSlug} signedIn={Boolean(session)} />;

  if (session === undefined) return <div className="center-state full">Loading…</div>;

  if (setup && setupNeedsAccount !== null) {
    const leave = () => {
      removeUrlFlag('setup');
      setSetup(false);
      setSetupNeedsAccount(null);
    };
    return (
      <SetupWizard
        needsAccount={setupNeedsAccount}
        simulateAccount={AUTH_DISABLED}
        onCancel={leave}
        onDone={(familyId) => {
          if (session) writeLastFamily(session.user.id, familyId);
          leave();
        }}
      />
    );
  }

  if (!session) return <AuthScreen onStartSetup={() => setSetup(true)} />;
  // Keyed by user so switching accounts resets all state.
  return <FamilyGate key={session.user.id} session={session} />;
}

export default App;
