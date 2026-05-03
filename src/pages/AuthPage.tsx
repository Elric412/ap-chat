import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { ArrowRight, Loader2, Eye, EyeOff, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import styles from './AuthPage.module.css';
import { validatePasswordPolicy } from '@/lib/password-policy';

const FEATURES = [
  { icon: Sparkles, title: 'Multi-model intelligence', desc: 'Switch between GPT, Claude, Gemini and Kimi instantly.' },
  { icon: ShieldCheck, title: 'AES-256 encrypted vault', desc: 'Your API keys never leave your device unencrypted.' },
  { icon: Zap, title: 'Local-first, cloud-synced', desc: 'IndexedDB speed with optional cross-device sync.' },
];

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
        else navigate('/');
      } else {
        const policy = validatePasswordPolicy(password);
        if (!policy.valid) {
          setError(policy.errors[0] ?? 'Password does not meet security requirements');
          setLoading(false);
          return;
        }
        const { error } = await signUp(email, password);
        if (error) setError(error.message);
        else setSuccess('Check your email for a confirmation link.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.gridBg} aria-hidden="true" />
      <div className={styles.orbA} aria-hidden="true" />
      <div className={styles.orbB} aria-hidden="true" />

      <div className={styles.shell}>
        {/* ── Showcase pane (desktop only) ── */}
        <aside className={styles.showcase} aria-hidden="true">
          <div className={styles.showcaseHeader}>
            <div className={styles.brandMark}>
              <div className={styles.brandGlyph} />
              <span className={styles.brandWord}>BYOK</span>
            </div>
            <p className={styles.tagline}>
              The unified workspace<br />for every frontier model.
            </p>
          </div>

          <ul className={styles.featureList}>
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className={styles.featureRow}>
                <span className={styles.featureIcon}>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <div className={styles.featureTitle}>{title}</div>
                  <div className={styles.featureDesc}>{desc}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.showcaseFooter}>
            <span className={styles.dot} />
            <span>End-to-end encrypted · No vendor lock-in</span>
          </div>
        </aside>

        {/* ── Form pane ── */}
        <main className={styles.formPane}>
          <div className={styles.formInner}>
            <div className={styles.brandMobile}>
              <div className={styles.brandGlyph} />
              <span className={styles.brandWord}>BYOK</span>
            </div>

            <header className={styles.headerBlock}>
              <h1 className={styles.heading}>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className={styles.subheading}>
                {mode === 'signin'
                  ? 'Sign in to access your encrypted workspace.'
                  : 'A few seconds to set up — your keys stay yours.'}
              </p>
            </header>

            <form className={styles.form} onSubmit={handleSubmit} noValidate>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  className={styles.field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className={styles.fieldGroup}>
                <div className={styles.labelRow}>
                  <label className={styles.fieldLabel} htmlFor="auth-password">Password</label>
                  {mode === 'signup' && (
                    <span className={styles.hintText}>Min. 12 characters</span>
                  )}
                </div>
                <div className={styles.fieldWrapper}>
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className={styles.field}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={mode === 'signup' ? 12 : 1}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className={styles.errorMsg} role="alert">
                  <span className={styles.errorDot} />
                  {error}
                </div>
              )}
              {success && (
                <div className={styles.successMsg} role="status">
                  {success}
                </div>
              )}

              <button className={styles.primaryBtn} type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 size={16} className={styles.spin} />
                ) : (
                  <>
                    <span>{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
                    <ArrowRight size={15} strokeWidth={2} />
                  </>
                )}
              </button>
            </form>

            <div className={styles.divider}>
              <span className={styles.dividerText}>or</span>
            </div>

            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => navigate('/')}
            >
              Continue without an account
            </button>

            <p className={styles.switchRow}>
              <span className={styles.switchText}>
                {mode === 'signin' ? "Don't have an account?" : 'Already have one?'}
              </span>
              <button
                type="button"
                className={styles.switchLink}
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); }}
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
