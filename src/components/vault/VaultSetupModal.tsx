import { useState, useRef, useEffect } from 'react';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../../store';
import { Spinner } from '../shared/Spinner';
import styles from './VaultModal.module.css';
import { validatePasswordPolicy } from '../../lib/password-policy';

export function VaultSetupModal(): JSX.Element | null {
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const vaultLoading = useAppStore((s) => s.vaultLoading);
  const vaultError = useAppStore((s) => s.vaultError);
  const setupVault = useAppStore((s) => s.setupVault);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-focus input on mount */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (vaultStatus !== 'uninitialized') return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setLocalError(null);

    const policy = validatePasswordPolicy(password);
    if (!policy.valid) {
      setLocalError(policy.errors[0] ?? 'Password does not meet security requirements');
      return;
    }
    if (password !== confirm) {
      setLocalError('Passwords do not match');
      return;
    }

    await setupVault(password);
    setPassword('');
    setConfirm('');
  };

  const displayError = localError ?? vaultError;

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Create Key Vault">
        <Shield size={32} className={styles.lockIcon} aria-hidden="true" />
        <h2 className={styles.title}>Create Key Vault</h2>
        <p className={styles.description}>
          Set a master password to encrypt your API keys locally. Keys never leave your browser.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputWrapper}>
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              className={styles.passwordInput}
              data-error={!!displayError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Master password"
              autoComplete="new-password"
              disabled={vaultLoading}
              aria-label="Master password"
            />
            <div className={styles.inputActions}>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <EyeOff size={18} aria-hidden="true" />
                  : <Eye size={18} aria-hidden="true" />
                }
              </button>
            </div>
          </div>
          <div className={styles.inputWrapper}>
            <input
              type={showPassword ? 'text' : 'password'}
              className={styles.passwordInput}
              data-error={!!displayError && localError === 'Passwords do not match'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
              disabled={vaultLoading}
              aria-label="Confirm password"
            />
          </div>
          {displayError && (
            <p className={styles.errorMessage}>{displayError}</p>
          )}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!password || !confirm || vaultLoading}
          >
            {vaultLoading ? <Spinner size={18} /> : 'Create Vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
