import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import styles from './AuthPage.module.css';

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
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
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>BYOK Chat</h1>
          <p className={styles.subtitle}>
            {mode === 'signin' ? 'Sign in to sync your conversations' : 'Create an account to get started'}
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="email">Email</label>
            <div className={styles.inputWrapper}>
              <Mail size={16} className={styles.inputIcon} aria-hidden="true" />
              <input
                id="email"
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                aria-required="true"
                aria-invalid={!!error}
              />
            </div>
          </div>

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="password">Password</label>
            <div className={styles.inputWrapper}>
              <Lock size={16} className={styles.inputIcon} aria-hidden="true" />
              <input
                id="password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                aria-required="true"
                aria-describedby={mode === 'signup' ? 'password-hint' : undefined}
              />
            </div>
            {mode === 'signup' && (
              <span id="password-hint" className="sr-only">Password must be at least 8 characters</span>
            )}
          </div>

          {error && <p className={styles.error} role="alert" aria-live="assertive">{error}</p>}
          {success && <p className={styles.success} role="status" aria-live="polite">{success}</p>}

          <button className={styles.submitBtn} type="submit" disabled={loading} aria-busy={loading}>
            {loading ? (
              <Loader2 size={18} className={styles.spinner} aria-label="Loading" />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <div className={styles.footer}>
          <span className={styles.footerText}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            type="button"
            className={styles.switchBtn}
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        <p className={styles.localNote}>
          Or continue without an account to use local storage only.
        </p>
        <button
          type="button"
          className={styles.skipBtn}
          onClick={() => navigate('/')}
        >
          Continue without signing in
        </button>
      </div>
    </div>
  );
}
