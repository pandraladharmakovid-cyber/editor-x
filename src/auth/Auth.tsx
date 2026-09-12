import {
  FormEvent,
  useEffect,
  useState,
} from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  UserPlus,
} from 'lucide-react';

import { supabase } from '../lib/supabase';

interface AuthProps {
  onAuthenticated?: () => void;
}

type AuthMode = 'sign-in' | 'sign-up';

export default function Auth({
  onAuthenticated,
}: AuthProps) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const checkExistingSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
      } else if (data.session) {
        onAuthenticated?.();
      }

      setCheckingSession(false);
    };

    void checkExistingSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) {
          return;
        }

        if (session) {
          onAuthenticated?.();
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [onAuthenticated]);

  const clearMessages = () => {
    setErrorMessage('');
    setSuccessMessage('');
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
    clearMessages();
  };

  const validateForm = (): boolean => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setErrorMessage('Please enter your email address.');
      return false;
    }

    if (!normalizedEmail.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return false;
    }

    if (password.length < 6) {
      setErrorMessage(
        'Password must contain at least 6 characters.',
      );
      return false;
    }

    if (
      mode === 'sign-up' &&
      password !== confirmPassword
    ) {
      setErrorMessage('Passwords do not match.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    clearMessages();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === 'sign-in') {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

        if (error) {
          throw error;
        }

        if (!data.session) {
          throw new Error(
            'Sign in completed, but no active session was returned.',
          );
        }

        setPassword('');
        onAuthenticated?.();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (error) {
        throw error;
      }

      setPassword('');
      setConfirmPassword('');

      if (data.session) {
        setSuccessMessage(
          'Your account has been created successfully.',
        );
        onAuthenticated?.();
        return;
      }

      setSuccessMessage(
        'Account created. Check your email to confirm your account, then sign in.',
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Authentication failed. Please try again.';

      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>
          <Loader2
            size={24}
            strokeWidth={2}
            style={styles.spinner}
          />
          <span>Checking your EDITOR X session...</span>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlow} />

      <section style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandIcon}>
            <Code2 size={25} strokeWidth={2.2} />
          </div>

          <div>
            <div style={styles.brandName}>EDITOR X</div>
            <div style={styles.brandSubtitle}>
              Browser development environment
            </div>
          </div>
        </div>

        <div style={styles.headingBlock}>
          <h1 style={styles.heading}>
            {mode === 'sign-in'
              ? 'Welcome back'
              : 'Create your account'}
          </h1>

          <p style={styles.description}>
            {mode === 'sign-in'
              ? 'Sign in to continue working on your projects.'
              : 'Create an account to keep your EDITOR X workspace available across devices.'}
          </p>
        </div>

        <div style={styles.modeSwitch}>
          <button
            type="button"
            onClick={() => switchMode('sign-in')}
            disabled={loading}
            style={{
              ...styles.modeButton,
              ...(mode === 'sign-in'
                ? styles.modeButtonActive
                : {}),
            }}
          >
            Sign In
          </button>

          <button
            type="button"
            onClick={() => switchMode('sign-up')}
            disabled={loading}
            style={{
              ...styles.modeButton,
              ...(mode === 'sign-up'
                ? styles.modeButtonActive
                : {}),
            }}
          >
            Sign Up
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={styles.form}
          noValidate
        >
          <label htmlFor="editor-x-email" style={styles.label}>
            Email address
          </label>

          <div style={styles.inputWrapper}>
            <Mail
              size={18}
              strokeWidth={1.8}
              style={styles.inputIcon}
            />

            <input
              id="editor-x-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearMessages();
              }}
              placeholder="you@example.com"
              disabled={loading}
              style={styles.input}
              aria-label="Email address"
            />
          </div>

          <label
            htmlFor="editor-x-password"
            style={styles.label}
          >
            Password
          </label>

          <div style={styles.inputWrapper}>
            <LockKeyhole
              size={18}
              strokeWidth={1.8}
              style={styles.inputIcon}
            />

            <input
              id="editor-x-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={
                mode === 'sign-in'
                  ? 'current-password'
                  : 'new-password'
              }
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearMessages();
              }}
              placeholder="Enter your password"
              disabled={loading}
              style={styles.input}
              aria-label="Password"
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword((visible) => !visible)
              }
              disabled={loading}
              style={styles.visibilityButton}
              aria-label={
                showPassword
                  ? 'Hide password'
                  : 'Show password'
              }
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>

          {mode === 'sign-up' && (
            <>
              <label
                htmlFor="editor-x-confirm-password"
                style={styles.label}
              >
                Confirm password
              </label>

              <div style={styles.inputWrapper}>
                <LockKeyhole
                  size={18}
                  strokeWidth={1.8}
                  style={styles.inputIcon}
                />

                <input
                  id="editor-x-confirm-password"
                  type={
                    showConfirmPassword
                      ? 'text'
                      : 'password'
                  }
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearMessages();
                  }}
                  placeholder="Enter your password again"
                  disabled={loading}
                  style={styles.input}
                  aria-label="Confirm password"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      (visible) => !visible,
                    )
                  }
                  disabled={loading}
                  style={styles.visibilityButton}
                  aria-label={
                    showConfirmPassword
                      ? 'Hide confirmation password'
                      : 'Show confirmation password'
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>

              <div style={styles.passwordHint}>
                Use at least 6 characters.
              </div>
            </>
          )}

          {errorMessage && (
            <div
              role="alert"
              style={styles.errorMessage}
            >
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              style={styles.successMessage}
            >
              <CheckCircle2
                size={17}
                strokeWidth={2}
              />
              <span>{successMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitButton,
              ...(loading ? styles.submitButtonDisabled : {}),
            }}
          >
            {loading ? (
              <>
                <Loader2
                  size={18}
                  style={styles.spinner}
                />
                {mode === 'sign-in'
                  ? 'Signing in...'
                  : 'Creating account...'}
              </>
            ) : (
              <>
                {mode === 'sign-in' ? (
                  <ArrowRight size={18} />
                ) : (
                  <UserPlus size={18} />
                )}

                {mode === 'sign-in'
                  ? 'Sign In'
                  : 'Create Account'}
              </>
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <span>
            {mode === 'sign-in'
              ? "Don't have an account?"
              : 'Already have an account?'}
          </span>

          <button
            type="button"
            onClick={() =>
              switchMode(
                mode === 'sign-in'
                  ? 'sign-up'
                  : 'sign-in',
              )
            }
            disabled={loading}
            style={styles.footerButton}
          >
            {mode === 'sign-in'
              ? 'Create one'
              : 'Sign in'}
          </button>
        </div>

        <div style={styles.securityNote}>
          Your authentication session is managed by Supabase.
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    background:
      'radial-gradient(circle at 50% 0%, #172033 0%, #0d1117 42%, #080b10 100%)',
    color: '#f3f4f6',
    padding: '32px 20px',
    boxSizing: 'border-box',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  backgroundGlow: {
    position: 'absolute',
    width: '520px',
    height: '520px',
    borderRadius: '50%',
    background:
      'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 70%)',
    top: '-260px',
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'none',
  },

  card: {
    width: '100%',
    maxWidth: '430px',
    position: 'relative',
    zIndex: 1,
    padding: '32px',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '16px',
    background: 'rgba(17, 22, 29, 0.94)',
    boxShadow:
      '0 24px 80px rgba(0, 0, 0, 0.45)',
    boxSizing: 'border-box',
    backdropFilter: 'blur(18px)',
  },

  loadingCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '24px 28px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.09)',
    background: '#11161d',
    color: '#c9d1d9',
    boxShadow:
      '0 20px 60px rgba(0, 0, 0, 0.35)',
  },

  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
    marginBottom: '30px',
  },

  brandIcon: {
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '11px',
    background: '#1f6feb',
    color: '#ffffff',
    flexShrink: 0,
  },

  brandName: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#ffffff',
  },

  brandSubtitle: {
    marginTop: '3px',
    fontSize: '11px',
    color: '#7d8590',
  },

  headingBlock: {
    marginBottom: '22px',
  },

  heading: {
    margin: 0,
    fontSize: '27px',
    lineHeight: 1.2,
    fontWeight: 650,
    letterSpacing: '-0.025em',
    color: '#f0f6fc',
  },

  description: {
    margin: '9px 0 0',
    fontSize: '13px',
    lineHeight: 1.55,
    color: '#8b949e',
  },

  modeSwitch: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px',
    padding: '4px',
    marginBottom: '22px',
    borderRadius: '9px',
    background: '#0d1117',
    border: '1px solid #21262d',
  },

  modeButton: {
    border: '0',
    borderRadius: '6px',
    padding: '9px 12px',
    background: 'transparent',
    color: '#8b949e',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  modeButtonActive: {
    background: '#21262d',
    color: '#f0f6fc',
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
  },

  label: {
    marginBottom: '7px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#c9d1d9',
  },

  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '15px',
  },

  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: '#6e7681',
    pointerEvents: 'none',
  },

  input: {
    width: '100%',
    height: '42px',
    boxSizing: 'border-box',
    border: '1px solid #30363d',
    borderRadius: '7px',
    outline: 'none',
    background: '#0d1117',
    color: '#f0f6fc',
    padding: '0 42px 0 39px',
    fontSize: '13px',
  },

  visibilityButton: {
    position: 'absolute',
    right: '5px',
    width: '34px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '0',
    borderRadius: '6px',
    background: 'transparent',
    color: '#6e7681',
    cursor: 'pointer',
  },

  passwordHint: {
    marginTop: '-6px',
    marginBottom: '14px',
    fontSize: '11px',
    color: '#6e7681',
  },

  errorMessage: {
    marginBottom: '14px',
    padding: '10px 12px',
    borderRadius: '7px',
    border: '1px solid rgba(248,81,73,0.35)',
    background: 'rgba(248,81,73,0.08)',
    color: '#ff7b72',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  successMessage: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '14px',
    padding: '10px 12px',
    borderRadius: '7px',
    border: '1px solid rgba(63,185,80,0.3)',
    background: 'rgba(63,185,80,0.08)',
    color: '#56d364',
    fontSize: '12px',
    lineHeight: 1.45,
  },

  submitButton: {
    width: '100%',
    minHeight: '43px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '2px',
    border: '1px solid rgba(88,166,255,0.4)',
    borderRadius: '7px',
    background: '#1f6feb',
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 650,
    cursor: 'pointer',
    boxShadow: '0 5px 18px rgba(31,111,235,0.2)',
  },

  submitButtonDisabled: {
    opacity: 0.7,
    cursor: 'wait',
  },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    marginTop: '22px',
    fontSize: '12px',
    color: '#8b949e',
  },

  footerButton: {
    border: 0,
    padding: 0,
    background: 'transparent',
    color: '#58a6ff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  securityNote: {
    marginTop: '22px',
    paddingTop: '16px',
    borderTop: '1px solid #21262d',
    textAlign: 'center',
    fontSize: '10px',
    color: '#484f58',
  },

  spinner: {
    animation: 'editor-x-auth-spin 0.9s linear infinite',
  },
};