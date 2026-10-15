import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { fetchMyFamilies } from '../lib/api';
import { clearPendingSetup, loadPendingSetup, readLastFamily, writeLastFamily, type SetupDraft } from '../lib/setup';
import type { Family } from '../lib/types';
import { FamilyApp } from './FamilyApp';
import { Onboarding } from './Onboarding';
import { SetupWizard } from './SetupWizard';

/** Invite links look like https://site/?join=CODE */
function readJoinCode() {
  return new URLSearchParams(window.location.search).get('join')?.toUpperCase() ?? '';
}

function clearJoinCode() {
  const url = new URL(window.location.href);
  url.searchParams.delete('join');
  window.history.replaceState(null, '', url);
}

/** Picks which family (tenant) to show, or onboarding when the user has none. */
export function FamilyGate({ session }: { session: Session }) {
  const me = session.user.id;
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(() => readLastFamily(me));
  const [joinCode, setJoinCode] = useState(readJoinCode);
  const [onboarding, setOnboarding] = useState(false);
  // Guided family setup for a signed-in user. Starts automatically when a draft was saved
  // before email confirmation, so the organiser picks up where they left off.
  const [wizard, setWizard] = useState<{ draft?: SetupDraft } | null>(() => {
    const draft = loadPendingSetup();
    return draft ? { draft } : null;
  });

  const reload = useCallback(
    () =>
      fetchMyFamilies()
        .then(setFamilies)
        .catch((err) => setError(err instanceof Error ? err.message : String(err))),
    [],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const open = useCallback(
    (familyId: string) => {
      writeLastFamily(me, familyId);
      setCurrentId(familyId);
    },
    [me],
  );

  if (error) {
    return (
      <div className="center-state full">
        <p className="form-error">Could not load your families: {error}</p>
        <p className="muted">If this is a new project, run <code>supabase/schema.sql</code> in the Supabase SQL editor.</p>
      </div>
    );
  }
  if (!families) return <div className="center-state full">Loading…</div>;

  const current = families.find((f) => f.id === currentId) ?? families[0];

  if (wizard) {
    return (
      <SetupWizard
        needsAccount={false}
        simulateAccount={false}
        initialDraft={wizard.draft}
        startAtReview={Boolean(wizard.draft)}
        onCancel={() => {
          clearPendingSetup();
          setWizard(null);
        }}
        onDone={async (familyId) => {
          await reload();
          open(familyId);
          setWizard(null);
          setOnboarding(false);
        }}
      />
    );
  }

  if (onboarding || joinCode || !current) {
    return (
      <Onboarding
        initialCode={joinCode}
        canCancel={Boolean(current)}
        onStartSetup={() => setWizard({})}
        onCancel={() => {
          clearJoinCode();
          setJoinCode('');
          setOnboarding(false);
        }}
        onDone={async (familyId) => {
          clearJoinCode();
          setJoinCode('');
          await reload();
          open(familyId);
          setOnboarding(false);
        }}
      />
    );
  }

  return (
    <FamilyApp
      // Keyed by family so switching tenants resets all tree/chat state.
      key={current.id}
      session={session}
      family={current}
      families={families}
      onSwitchFamily={open}
      onAddFamily={() => setOnboarding(true)}
      onFamiliesChanged={reload}
    />
  );
}
