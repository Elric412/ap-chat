import { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAppStore } from '../../store';
import { Spinner } from '../shared/Spinner';
import styles from './VaultModal.module.css';

export function VaultUnlockModal(): JSX.Element | null {
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const vaultLoading = useAppStore((s) => s.vaultLoading);
  const vaultError = useAppStore((s) => s.vaultError);
  const unlockVault = useAppStore((s) => s.unlockVault);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Auto-focus input on mount */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  if (vaultStatus !== 'locked') return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!password || vaultLoading) return;
    const success = await unlockVault(password);
    if (success) {
      setUnlocked(true);
    }
    setPassword('');
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Unlock Key Vault">
        <Lock
          size={32}
          className={styles.lockIcon}
          data-unlocked={unlocked}
          aria-hidden="true"
        />
        <h2 className={styles.title}>Unlock Key Vault</h2>
        <p className={styles.description}>
          Enter your master password to decrypt your API keys.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputWrapper}>
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              className={styles.passwordInput}
              data-error={!!vaultError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Master password"
              autoComplete="off"
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
          {vaultError && (
            <p className={styles.errorMessage}>{vaultError}</p>
          )}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={!password || vaultLoading}
          >
            {vaultLoading ? <Spinner size={18} /> : 'Unlock'}
          </button>
        </form>
        <button type="button" className={styles.footerLink}>
          Forgot password? Keys must be re-entered.
        </button>
      </div>
    </div>
  );
}
