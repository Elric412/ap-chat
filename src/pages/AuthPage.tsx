import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';
import styles from './AuthPage.module.css';
import { validatePasswordPolicy } from '@/lib/password-policy';

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
        if (error) {
          setError(error.message);
        } else {
          navigate('/');
        }
      } else {
        const policy = validatePasswordPolicy(password);
        if (!policy.valid) {
          setError(policy.errors[0] ?? 'Password does not meet security requirements');
          setLoading(false);
          return;
        }

        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setSuccess('Check your email for a confirmation link!');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* Ambient background orbs */}
      <div className={styles.orbA} aria-hidden="true" />
      <div className={styles.orbB} aria-hidden="true" />

      <div className={styles.card}>
        {/* Brand mark */}
        <div className={styles.brandRow}>
          <div className={styles.brandDot} />
          <span className={styles.brandName}>BYOK</span>
        </div>

        {/* Header copy */}
        <div className={styles.headerBlock}>
          <h1 className={styles.heading}>
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className={styles.subheading}>
            {mode === 'signin'
              ? 'Sign in to continue to your workspace.'
              : 'Start using multi-model AI with your own keys.'}
          </p>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor="auth-email">Email</label>
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
            <label className={styles.fieldLabel} htmlFor="auth-password">Password</label>
            <div className={styles.fieldWrapper}>
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                className={styles.field}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                minLength={12}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && <p className={styles.errorMsg}>{error}</p>}
          {success && <p className={styles.successMsg}>{success}</p>}

          <button className={styles.primaryBtn} type="submit" disabled={loading}>
            {loading ? (
              <Loader2 size={16} className={styles.spin} />
            ) : (
              <>
                {mode === 'signin' ? 'Sign in' : 'Create account'}
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className={styles.divider}>
          <span className={styles.dividerText}>or</span>
        </div>

        {/* Skip */}
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => navigate('/')}
        >
          Continue without an account
        </button>

        {/* Switch mode */}
        <p className={styles.switchRow}>
          <span className={styles.switchText}>
            {mode === 'signin' ? "No account yet?" : 'Already have one?'}
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
    </div>
  );
}
