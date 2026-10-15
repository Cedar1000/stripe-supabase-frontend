import { SignIn, SignUp } from '@clerk/react';
import { Icon } from './ui';

/** The current page without Clerk's #/ routes, so invite (?join=) and setup links survive sign-in. */
function currentUrl(withSetup = false) {
  const url = new URL(window.location.href);
  url.hash = '';
  if (withSetup) url.searchParams.set('setup', '');
  return url.toString();
}

// Clerk's form fills the auth card instead of drawing a second card inside it.
const embedded = {
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
  },
};

/** Signed-out home: Clerk sign-in (email or Google; new users can sign up from here too). */
export function AuthScreen({ onStartSetup }: { onStartSetup: () => void }) {
  const back = currentUrl();
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

        <SignIn appearance={embedded} routing="hash" withSignUp forceRedirectUrl={back} signUpForceRedirectUrl={back} />
      </div>
    </div>
  );
}

/** First step of family setup for signed-out visitors; the wizard opens once they're signed up. */
export function SetupSignUp({ onCancel }: { onCancel: () => void }) {
  const next = currentUrl(true);
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="tree" size={26} /></span>
          <div>
            <h1>Set up your family’s tree</h1>
            <p>Create your account first. You’ll be the family’s first administrator.</p>
          </div>
        </div>

        <SignUp appearance={embedded} routing="hash" forceRedirectUrl={next} signInForceRedirectUrl={next} />

        <p className="muted small">
          Already have an account? <button type="button" className="link" onClick={onCancel}>Sign in instead</button>
        </p>
      </div>
    </div>
  );
}
