import { useUser } from '@clerk/react';
import { useEffect, useState } from 'react';
import './App.css';
import { AuthScreen, SetupSignUp } from './components/AuthScreen';
import { FamilyGate } from './components/FamilyGate';
import { PublicTreePage } from './components/PublicTreePage';
import { SetupWizard } from './components/SetupWizard';
import { ensureProfile } from './lib/api';
import { AUTH_DISABLED, demoSession } from './lib/demo';
import { hasUrlFlag, removeUrlFlag, writeLastFamily } from './lib/setup';
import type { AuthSession } from './lib/types';

/** Public share links look like https://site/?tree=okafor-7k2p9qrx */
const publicSlug = new URLSearchParams(window.location.search).get('tree');

function App() {
  const { isLoaded, user } = useUser();
  const session: AuthSession | null | undefined = AUTH_DISABLED
    ? demoSession
    : !isLoaded
      ? undefined
      : user
        ? { user: { id: user.id, email: user.primaryEmailAddress?.emailAddress } }
        : null;
  const userId = AUTH_DISABLED ? null : (user?.id ?? null);

  // Guided sign-up + family setup, started from the sign-in screen or a ?setup link.
  const [setup, setSetup] = useState(() => hasUrlFlag('setup'));

  // Every signed-in Clerk user needs a user_profiles row before the database will accept them.
  const [profileReadyFor, setProfileReadyFor] = useState<string | null>(null);
  const [profileError, setProfileError] = useState('');
  useEffect(() => {
    if (!userId) return;
    ensureProfile()
      .then(() => setProfileReadyFor(userId))
      .catch((err) => setProfileError(err instanceof Error ? err.message : String(err)));
  }, [userId]);

  // Public pages need no login, so they don't wait for the session either.
  if (publicSlug) return <PublicTreePage slug={publicSlug} signedIn={Boolean(session)} />;

  if (session === undefined) return <div className="center-state full">Loading…</div>;

  const leaveSetup = () => {
    removeUrlFlag('setup');
    setSetup(false);
  };

  if (!session) {
    if (setup) return <SetupSignUp onCancel={leaveSetup} />;
    return <AuthScreen onStartSetup={() => setSetup(true)} />;
  }

  if (profileError) {
    return (
      <div className="center-state full">
        <p className="form-error">Could not set up your profile: {profileError}</p>
        <p className="muted">If this is a new project, run <code>supabase/schema.sql</code> in the Supabase SQL editor.</p>
      </div>
    );
  }
  if (!AUTH_DISABLED && profileReadyFor !== session.user.id) return <div className="center-state full">Loading…</div>;

  if (setup) {
    return (
      <SetupWizard
        needsAccount={AUTH_DISABLED}
        accountName={user?.fullName ?? ''}
        onCancel={leaveSetup}
        onDone={(familyId) => {
          writeLastFamily(session.user.id, familyId);
          leaveSetup();
        }}
      />
    );
  }

  // Keyed by user so switching accounts resets all state.
  return <FamilyGate key={session.user.id} session={session} />;
}

export default App;
