import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Mail, Lock, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Sparkles, Database } from 'lucide-react';
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
      <div className={styles.container}>
        <aside className={styles.showcase}>
          <p className={styles.eyebrow}>Private AI Workspace</p>
          <h1 className={styles.title}>BYOK Chat</h1>
          <p className={styles.subtitle}>
            Run premium multi-model conversations with your own keys, full session control, and optional cloud sync.
          </p>

          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <ShieldCheck size={16} />
              <span>Bring-your-own-keys architecture with encrypted vault defaults.</span>
            </li>
            <li className={styles.featureItem}>
              <Sparkles size={16} />
              <span>Fast model switching, comparison mode, and export-ready workflows.</span>
            </li>
            <li className={styles.featureItem}>
              <Database size={16} />
              <span>Stay local when you want, sync when you need.</span>
            </li>
          </ul>
        </aside>

        <div className={styles.panel}>
          <div className={styles.header}>
            <p className={styles.modeLabel}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</p>
            <h2 className={styles.panelTitle}>{mode === 'signin' ? 'Sign in' : 'Sign up'}</h2>
            <p className={styles.panelSubtitle}>
              {mode === 'signin'
                ? 'Continue to your conversations and model presets.'
                : 'Start syncing sessions and preferences across devices.'}
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="email">Email</label>
              <div className={styles.inputWrapper}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="password">Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={16} className={styles.inputIcon} />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={12}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}
            {success && <p className={styles.success}>{success}</p>}

            <button className={styles.submitBtn} type="submit" disabled={loading}>
              {loading ? (
                <Loader2 size={18} className={styles.spinner} />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                  <ArrowRight size={16} />
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
    </div>
  );
}
