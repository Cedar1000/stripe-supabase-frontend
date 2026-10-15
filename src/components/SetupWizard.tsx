import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { createFamily, createPerson, fetchInviteCode, renameFamily, uploadPhoto } from '../lib/api';
import { datesFromDrafts, formatDate, type StoredDates } from '../lib/dates';
import { emptyDraft, newChild, type ChildDraft, type SetupDraft } from '../lib/setup';
import { fullName } from '../lib/tree';
import type { Gender } from '../lib/types';
import { DateFields } from './DateFields';
import { Avatar, Icon } from './ui';

type Step = 'account' | 'family' | 'ancestor' | 'children' | 'review';
type Phase = 'steps' | 'creating' | 'done';

const STEP_LABELS: Record<Step, string> = {
  account: 'Your account',
  family: 'Family name',
  ancestor: 'First ancestor',
  children: 'Their children',
  review: 'Review',
};

const surname = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

export function SetupWizard({
  needsAccount,
  accountName = '',
  onDone,
  onCancel,
}: {
  /**
   * Demo mode: show a simulated sign-up step first. Real accounts are created with Clerk's
   * sign-up screen before the wizard opens.
   */
  needsAccount: boolean;
  /** The signed-in user's name, used to suggest a family name. */
  accountName?: string;
  /** Called with the new family's id when the organiser opens their tree. */
  onDone: (familyId: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<SetupDraft>(emptyDraft);
  const [accountDone, setAccountDone] = useState(!needsAccount);
  const [account, setAccount] = useState({ name: accountName, email: '', password: '' });
  const [photo, setPhoto] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('steps');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = needsAccount ? ['account'] : [];
    list.push('family', 'ancestor');
    if (draft.ancestor) list.push('children');
    list.push('review');
    return list;
  }, [needsAccount, draft.ancestor]);
  const [step, setStep] = useState<Step>(needsAccount ? 'account' : 'family');
  const stepIndex = steps.indexOf(step);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // Keep the step heading in view when moving between steps (matters on phones).
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [step, phase]);

  const go = (next: Step) => {
    setError('');
    setStep(next);
  };
  // Once the account exists there is no going back to the sign-up form.
  const canGoBack = stepIndex > 0 && !(steps[stepIndex - 1] === 'account' && accountDone);
  const back = () => canGoBack && go(steps[stepIndex - 1]);
  const forward = () => go(steps[stepIndex + 1]);

  const update = (patch: Partial<SetupDraft>) => {
    setError('');
    setDraft((d) => ({ ...d, ...patch }));
  };
  const kids = draft.children.filter((c) => c.first_name.trim());

  // ---- Step validation + "Next" ------------------------------------------------------------

  const next = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (step === 'account') return createAccount();
    if (step === 'family' && !draft.familyName.trim()) return setError('Give your family tree a name.');
    if (step === 'ancestor' && draft.ancestor) {
      if (!draft.ancestor.first_name.trim()) return setError('Enter their first name, or choose “Skip for now”.');
      const dates = datesFromDrafts(draft.ancestor.birth, draft.ancestor.deceased, draft.ancestor.death);
      if ('error' in dates) return setError(dates.error);
    }
    if (step === 'children') {
      for (const c of kids) {
        const dates = datesFromDrafts(c.birth, false, c.birth);
        if ('error' in dates) return setError(`${fullName(c)}: ${dates.error}`);
      }
    }
    if (step === 'review') return create();
    forward();
  };

  const createAccount = async () => {
    if (accountDone) return forward();
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setAccountDone(true);
      if (!draft.familyName && surname(account.name)) update({ familyName: `The ${surname(account.name)} Family` });
      forward();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // ---- Creating everything (resumable if a step fails) ---------------------------------------

  type Progress = { familyId?: string; familyName?: string; ancestorId?: string; childrenDone: number };
  const progressRef = useRef<Progress>({ childrenDone: 0 });
  const [progress, setProgressState] = useState<Progress>({ childrenDone: 0 });
  const setProgress = (patch: Partial<Progress>) => {
    progressRef.current = { ...progressRef.current, ...patch };
    setProgressState(progressRef.current);
  };
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const create = async () => {
    setPhase('creating');
    setError('');
    const p = progressRef.current;
    try {
      let familyId = p.familyId;
      if (!familyId) {
        familyId = await createFamily(draft.familyName);
        setProgress({ familyId, familyName: draft.familyName.trim() });
      } else if (p.familyName !== draft.familyName.trim()) {
        await renameFamily(familyId, draft.familyName);
        setProgress({ familyName: draft.familyName.trim() });
      }

      const a = draft.ancestor;
      if (a && !p.ancestorId) {
        const photoUrlSaved = photo ? await uploadPhoto(familyId, photo) : null;
        const created = await createPerson(familyId, {
          parent_id: null,
          first_name: a.first_name.trim(),
          last_name: a.last_name.trim(),
          gender: a.gender,
          photo_url: photoUrlSaved,
          ...(datesFromDrafts(a.birth, a.deceased, a.death) as StoredDates),
          is_deceased: a.deceased,
          bio: a.bio.trim(),
        });
        setProgress({ ancestorId: created.id });
      }

      const parentId = progressRef.current.ancestorId;
      if (parentId) {
        for (let i = progressRef.current.childrenDone; i < kids.length; i++) {
          const c = kids[i];
          await createPerson(familyId, {
            parent_id: parentId,
            first_name: c.first_name.trim(),
            last_name: c.last_name.trim(),
            gender: c.gender,
            photo_url: null,
            ...(datesFromDrafts(c.birth, false, c.birth) as StoredDates),
            is_deceased: c.deceased,
            bio: '',
          });
          setProgress({ childrenDone: i + 1 });
        }
      }

      setInviteCode(await fetchInviteCode(familyId).catch(() => null));
      setPhase('done');
    } catch (err) {
      setError(`Something went wrong: ${err instanceof Error ? err.message : String(err)}. Your progress is kept — try again.`);
      setPhase('steps');
    }
  };

  // ---- Screens -----------------------------------------------------------------------------

  if (phase === 'creating') {
    const items: { label: string; done: boolean }[] = [
      { label: `Creating ${draft.familyName.trim()}`, done: Boolean(progress.familyId) },
      ...(draft.ancestor ? [{ label: `Adding ${fullName(draft.ancestor)}`, done: Boolean(progress.ancestorId) }] : []),
      ...(draft.ancestor && kids.length
        ? [{ label: `Adding ${kids.length} ${kids.length === 1 ? 'child' : 'children'}`, done: progress.childrenDone >= kids.length }]
        : []),
    ];
    const active = items.findIndex((s) => !s.done);
    return (
      <WizardShell top={top}>
        <div className="wizard-card wizard-message">
          <span className="spinner" aria-hidden="true" />
          <h1>Planting your tree…</h1>
          <ul className="create-steps" aria-live="polite">
            {items.map((s, i) => (
              <li key={s.label} className={s.done ? 'done' : i === active ? 'active' : ''}>
                <span aria-hidden="true">{s.done ? '✓' : i === active ? '•' : ''}</span> {s.label}
              </li>
            ))}
          </ul>
        </div>
      </WizardShell>
    );
  }

  if (phase === 'done') {
    return (
      <WizardShell top={top}>
        <DoneScreen
          familyName={draft.familyName.trim()}
          inviteCode={inviteCode}
          onOpen={() => onDone(progressRef.current.familyId!)}
        />
      </WizardShell>
    );
  }

  return (
    <WizardShell
      top={top}
      aside={step !== 'account' && <TreePreview draft={draft} photoUrl={photoUrl} />}
    >
      <ol className="wizard-progress" aria-label="Setup steps">
        {steps.map((s, i) => (
          <li key={s} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
            <span className="wizard-dot">{i < stepIndex ? '✓' : i + 1}</span>
            <span className="wizard-step-label">{STEP_LABELS[s]}</span>
          </li>
        ))}
      </ol>

      <form className="wizard-card form" onSubmit={next} noValidate={step !== 'account'}>
        <p className="wizard-count">Step {stepIndex + 1} of {steps.length}</p>

        {step === 'account' && (
          <AccountStep account={account} setAccount={setAccount} done={accountDone} onSignIn={onCancel} />
        )}

        {step === 'family' && (
          <>
            <StepHeading title="What should we call your family tree?" lead="This is the name relatives will see when they join. You can change it later." />
            <label>
              Family name
              <input value={draft.familyName} onChange={(e) => update({ familyName: e.target.value })} placeholder="e.g. The Okafor Family" maxLength={80} autoFocus />
            </label>
            {surname(account.name) && draft.familyName !== `The ${surname(account.name)} Family` && (
              <button type="button" className="chip" onClick={() => update({ familyName: `The ${surname(account.name)} Family` })}>
                The {surname(account.name)} Family
              </button>
            )}
          </>
        )}

        {step === 'ancestor' && (
          <AncestorStep
            draft={draft}
            update={update}
            photoUrl={photoUrl}
            setPhoto={setPhoto}
            onSkip={() => {
              update({ ancestor: null });
              setError('');
              setStep('review');
            }}
          />
        )}

        {step === 'children' && draft.ancestor && (
          <ChildrenStep parentName={draft.ancestor.first_name.trim()} kids={draft.children} setKids={(children) => update({ children })} />
        )}

        {step === 'review' && (
          <ReviewStep draft={draft} kids={kids} photoUrl={photoUrl} jump={go} hasAccountStep={needsAccount} />
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="wizard-actions">
          {canGoBack ? (
            <button type="button" className="button button-ghost" onClick={back}>
              <Icon name="back" size={16} /> Back
            </button>
          ) : onCancel && step !== 'account' ? (
            <button type="button" className="button button-ghost" onClick={onCancel}>Cancel</button>
          ) : (
            <span />
          )}
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy
              ? 'Please wait…'
              : step === 'account'
                ? accountDone ? 'Continue' : 'Create account'
                : step === 'review'
                  ? 'Create family tree'
                  : step === 'children' && kids.length === 0
                    ? 'Skip for now'
                    : 'Continue'}
          </button>
        </div>
      </form>
    </WizardShell>
  );
}

// ---- Pieces ------------------------------------------------------------------------------

function WizardShell({ top, aside, children }: { top: RefObject<HTMLDivElement | null>; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="wizard-page" ref={top}>
      <header className="wizard-header">
        <span className="brand-mark"><Icon name="tree" size={20} /></span>
        <span className="brand-name">Family Tree</span>
      </header>
      <div className={`wizard-layout ${aside ? 'has-aside' : ''}`}>
        <main className="wizard-main">{children}</main>
        {aside && <aside className="wizard-aside" aria-label="Preview">{aside}</aside>}
      </div>
    </div>
  );
}

function StepHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="step-heading">
      <h1>{title}</h1>
      <p>{lead}</p>
    </div>
  );
}

function GenderToggle({ value, onChange, name }: { value: Gender; onChange: (g: Gender) => void; name: string }) {
  return (
    <div className="gender-toggle" role="radiogroup" aria-label="Sex">
      {(['male', 'female'] as const).map((g) => (
        <label key={g} className={value === g ? 'checked' : ''}>
          <input type="radio" name={name} className="sr-only" checked={value === g} onChange={() => onChange(g)} />
          {g === 'male' ? 'Male' : 'Female'}
        </label>
      ))}
    </div>
  );
}

function AccountStep({ account, setAccount, done, onSignIn }: {
  account: { name: string; email: string; password: string };
  setAccount: (a: { name: string; email: string; password: string }) => void;
  done: boolean;
  onSignIn?: () => void;
}) {
  if (done) {
    return <StepHeading title="You’re signed up" lead={`Signed in as ${account.email || 'you'}. Let’s set up your family.`} />;
  }
  return (
    <>
      <StepHeading
        title="Set up your family’s tree"
        lead="You’ll be the family’s first administrator. In a few minutes you’ll have the first branches in place and an invite to share."
      />
      <label>
        Your name
        <input required value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} autoComplete="name" autoFocus />
      </label>
      <label>
        Email
        <input type="email" required value={account.email} onChange={(e) => setAccount({ ...account, email: e.target.value })} autoComplete="email" />
      </label>
      <label>
        Password
        <input type="password" required minLength={6} value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} autoComplete="new-password" />
        <span className="hint">At least 6 characters.</span>
      </label>
      <p className="hint">Demo: no account is actually created.</p>
      {onSignIn && (
        <p className="muted small">
          Already have an account? <button type="button" className="link" onClick={onSignIn}>Sign in instead</button>
        </p>
      )}
    </>
  );
}

function AncestorStep({ draft, update, photoUrl, setPhoto, onSkip }: {
  draft: SetupDraft;
  update: (patch: Partial<SetupDraft>) => void;
  photoUrl: string | null;
  setPhoto: (f: File | null) => void;
  onSkip: () => void;
}) {
  // Coming back after skipping restores an empty ancestor.
  const a = draft.ancestor ?? emptyDraft().ancestor!;
  const set = (patch: Partial<typeof a>) => update({ ancestor: { ...a, ...patch } });
  return (
    <>
      <StepHeading
        title="Who is at the top of your tree?"
        lead="Start with the oldest ancestor you know — a grandparent or great-grandparent. Everyone else will branch down from them."
      />
      <div className="photo-field">
        <Avatar person={{ first_name: a.first_name, last_name: a.last_name, photo_url: photoUrl, gender: a.gender, is_deceased: false }} size={72} />
        <div className="photo-actions">
          <label className="button button-secondary">
            {photoUrl ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          {photoUrl && <button type="button" className="button button-ghost" onClick={() => setPhoto(null)}>Remove</button>}
        </div>
      </div>
      <div className="name-fields">
        <label>
          First name
          <input value={a.first_name} onChange={(e) => set({ first_name: e.target.value })} placeholder="e.g. Emmanuel" autoComplete="off" autoFocus />
        </label>
        <label>
          <span>Last name <span className="optional">optional</span></span>
          <input value={a.last_name} onChange={(e) => set({ last_name: e.target.value })} placeholder="e.g. Okafor" autoComplete="off" />
        </label>
      </div>
      <fieldset>
        <legend>Sex</legend>
        <GenderToggle name="ancestor-gender" value={a.gender} onChange={(gender) => set({ gender })} />
      </fieldset>
      <DateFields legend="Date of birth" value={a.birth} onChange={(birth) => set({ birth })} hint="Just the year is fine if that’s all you know." />
      <label className="checkbox">
        <input type="checkbox" checked={a.deceased} onChange={(e) => set({ deceased: e.target.checked })} /> They have passed away
      </label>
      {a.deceased && <DateFields legend="Date of death" value={a.death} onChange={(death) => set({ death })} hint="Leave blank if unknown." />}
      <label>
        <span>A little about them <span className="optional">optional</span></span>
        <textarea rows={3} maxLength={1500} value={a.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="Where they lived, what they did, a family story…" />
      </label>
      <button type="button" className="link skip-link" onClick={onSkip}>Skip for now — I’ll add people later</button>
    </>
  );
}

function ChildrenStep({ parentName, kids, setKids }: { parentName: string; kids: ChildDraft[]; setKids: (k: ChildDraft[]) => void }) {
  const set = (key: string, patch: Partial<ChildDraft>) => setKids(kids.map((k) => (k.key === key ? { ...k, ...patch } : k)));
  return (
    <>
      <StepHeading
        title={`Add ${parentName || 'their'}’s children`}
        lead="Just names and birth years are enough for now. They’ll be ordered by date of birth, and you can add photos and details later from the tree."
      />
      <ul className="child-rows">
        {kids.map((k, i) => (
          <li key={k.key} className="child-row">
            <div className="child-row-top">
              <label className="child-name">
                <span className="sr-only">Child {i + 1} first name</span>
                <input value={k.first_name} onChange={(e) => set(k.key, { first_name: e.target.value })} placeholder={`Child ${i + 1} first name`} autoComplete="off" />
              </label>
              <label className="child-name">
                <span className="sr-only">Child {i + 1} last name (optional)</span>
                <input value={k.last_name} onChange={(e) => set(k.key, { last_name: e.target.value })} placeholder="Last name (optional)" autoComplete="off" />
              </label>
              <button type="button" className="icon-button" onClick={() => setKids(kids.filter((x) => x.key !== k.key))} aria-label={`Remove child ${i + 1}`}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="child-row-details">
              <GenderToggle name={`gender-${k.key}`} value={k.gender} onChange={(gender) => set(k.key, { gender })} />
              <label className="checkbox">
                <input type="checkbox" checked={k.deceased} onChange={(e) => set(k.key, { deceased: e.target.checked })} /> Deceased
              </label>
            </div>
            <DateFields legend="Born" value={k.birth} onChange={(birth) => set(k.key, { birth })} hint="" />
          </li>
        ))}
      </ul>
      <button type="button" className="button button-secondary full" onClick={() => setKids([...kids, newChild()])}>
        <Icon name="plus" size={18} /> Add another child
      </button>
    </>
  );
}

function ReviewStep({ draft, kids, photoUrl, jump, hasAccountStep }: {
  draft: SetupDraft;
  kids: ChildDraft[];
  photoUrl: string | null;
  jump: (s: Step) => void;
  hasAccountStep: boolean;
}) {
  const a = draft.ancestor;
  const ancestorDates = a ? datesFromDrafts(a.birth, a.deceased, a.death) : null;
  return (
    <>
      <StepHeading title="Ready to create your tree?" lead="Check everything looks right. You can change any of it later from the tree." />
      <dl className="review-list">
        <div>
          <dt>Family name</dt>
          <dd>{draft.familyName.trim()}</dd>
          <button type="button" className="link" onClick={() => jump('family')}>Edit</button>
        </div>
        <div>
          <dt>First ancestor</dt>
          <dd>
            {a ? (
              <span className="review-person">
                <Avatar person={{ first_name: a.first_name, last_name: a.last_name, photo_url: photoUrl, gender: a.gender, is_deceased: a.deceased }} size={36} />
                <span>
                  <strong>{fullName(a)}</strong>
                  {ancestorDates && !('error' in ancestorDates) && (
                    <small>
                      {formatDate(ancestorDates.birth_date, ancestorDates.birth_precision) || 'Birth unknown'}
                      {a.deceased && ` – ${formatDate(ancestorDates.death_date, ancestorDates.death_precision) || '?'}`}
                    </small>
                  )}
                </span>
              </span>
            ) : (
              <span className="muted">None yet — you’ll add people from the tree</span>
            )}
          </dd>
          <button type="button" className="link" onClick={() => jump('ancestor')}>Edit</button>
        </div>
        {a && (
          <div>
            <dt>Children</dt>
            <dd>{kids.length ? kids.map(fullName).join(', ') : <span className="muted">None yet</span>}</dd>
            <button type="button" className="link" onClick={() => jump('children')}>Edit</button>
          </div>
        )}
        <div>
          <dt>Your role</dt>
          <dd>1st-level administrator — you can edit anything and appoint other admins.</dd>
        </div>
      </dl>
      {hasAccountStep && <p className="hint">Next you’ll get an invite link to share with relatives.</p>}
    </>
  );
}

function TreePreview({ draft, photoUrl }: { draft: SetupDraft; photoUrl: string | null }) {
  const a = draft.ancestor;
  const kids = draft.children
    .filter((c) => c.first_name.trim())
    .map((c) => {
      const d = datesFromDrafts(c.birth, false, c.birth);
      return { ...c, sort: 'error' in d ? null : d.birth_date };
    })
    .sort((x, y) => (x.sort && y.sort ? x.sort.localeCompare(y.sort) : x.sort ? -1 : y.sort ? 1 : 0));
  return (
    <div className="tree-preview">
      <p className="preview-label">Preview</p>
      <h2>{draft.familyName.trim() || 'Your family'}</h2>
      {a && a.first_name.trim() ? (
        <div className="preview-tree">
          <div className={`preview-card person-${a.gender}`}>
            <Avatar person={{ first_name: a.first_name, last_name: a.last_name, photo_url: photoUrl, gender: a.gender, is_deceased: a.deceased }} size={44} />
            <span>{fullName(a)}</span>
          </div>
          {kids.length > 0 && (
            <>
              <span className="preview-stem" aria-hidden="true" />
              <div className="preview-children">
                {kids.map((k) => (
                  <div key={k.key} className={`preview-card small person-${k.gender}`}>
                    <Avatar person={{ first_name: k.first_name, last_name: k.last_name, photo_url: null, gender: k.gender, is_deceased: k.deceased }} size={30} />
                    <span>{fullName(k)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="muted">Your tree will appear here as you add people.</p>
      )}
    </div>
  );
}

function DoneScreen({ familyName, inviteCode, onOpen }: { familyName: string; inviteCode: string | null; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = inviteCode ? `${window.location.origin}${window.location.pathname}?join=${inviteCode}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code is still shown on screen.
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: familyName, text: `Join ${familyName} on Family Tree (code ${inviteCode})`, url: link });
    } catch {
      // Share sheet dismissed.
    }
  };
  return (
    <div className="wizard-card wizard-message done">
      <span className="wizard-icon">🌳</span>
      <h1>{familyName} is ready</h1>
      <p>Now invite relatives so they can see the tree, chat and get birthday alerts.</p>
      {inviteCode && (
        <div className="invite-box">
          <span className="invite-code" aria-label="Invite code">{inviteCode}</span>
          <div className="invite-actions">
            {typeof navigator.share === 'function' && <button type="button" className="button button-secondary" onClick={share}>Share invite</button>}
            <button type="button" className="button button-secondary" onClick={copy}>{copied ? 'Copied!' : 'Copy invite link'}</button>
          </div>
        </div>
      )}
      <ul className="tips">
        <li><strong>Tap a card</strong> to see details and use <strong>ADD</strong> to add their children.</li>
        <li><strong>Double-tap</strong> a card to show or hide its branch.</li>
        <li>Make a relative a <strong>branch admin</strong> so they can maintain their side of the family.</li>
      </ul>
      <button type="button" className="button button-primary full" onClick={onOpen}>Open my family tree</button>
      <p className="hint">You can find the invite code again any time by tapping the family name.</p>
    </div>
  );
}
