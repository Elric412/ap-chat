import { useState, useRef } from 'react';
import { Plus, Trash2, Lock, Key } from 'lucide-react';
import { useAppStore } from '../../store';
import { PROVIDER_META } from '../../constants/provider-meta';
import { PROVIDER_IDS, type ProviderId } from '../../types/models';
import { Spinner } from '../shared/Spinner';
import styles from './KeyManagement.module.css';

const PROVIDER_LIST = Object.entries(PROVIDER_META) as [ProviderId, typeof PROVIDER_META[ProviderId]][];

export function KeyManagement(): JSX.Element {
  const keyRecords = useAppStore((s) => s.keyRecords);
  const addKey = useAppStore((s) => s.addKey);
  const removeKey = useAppStore((s) => s.removeKey);
  const lockVault = useAppStore((s) => s.lockVault);
  const addToast = useAppStore((s) => s.addToast);

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(PROVIDER_IDS.openai);
  const [keyValue, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);

  const configuredProviders = new Set(keyRecords.map((r) => r.providerId));

  const unconfiguredProviders = PROVIDER_LIST.filter(
    ([id]) => !configuredProviders.has(id)
  );

  const handleAddKey = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setValidationError(null);

    const trimmedKey = keyValue.trim();

    if (!trimmedKey) {
      setValidationError('API key cannot be empty');
      return;
    }

    // Security: Limit key length to prevent abuse
    if (trimmedKey.length > 500) {
      setValidationError('API key is too long (max 500 characters)');
      return;
    }

    // Security: Block keys that look like they contain scripts or injection
    if (/<script|javascript:|on\w+=/i.test(trimmedKey)) {
      setValidationError('Invalid characters detected in API key');
      return;
    }

    const meta = PROVIDER_META[selectedProvider];
    if (selectedProvider !== PROVIDER_IDS.ollama && !meta.keyPattern.test(trimmedKey)) {
      setValidationError(`Key format does not match expected pattern for ${meta.displayName}`);
      return;
    }

    setSaving(true);
    try {
      await addKey(selectedProvider, keyValue.trim());
      addToast({
        type: 'success',
        title: `${meta.displayName} key added`,
        description: 'API key encrypted and stored securely.',
        dismissible: true,
      });
      setKeyValue('');
      setShowAddForm(false);
    } catch {
      setValidationError('Failed to encrypt and store key');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId: ProviderId): Promise<void> => {
    const meta = PROVIDER_META[providerId];
    // Security: Confirm destructive action
    if (!window.confirm(`Remove ${meta.displayName} API key? This cannot be undone.`)) return;
    await removeKey(providerId);
    addToast({
      type: 'info',
      title: `${meta.displayName} key removed`,
      dismissible: true,
    });
  };

  return (
    <div className={styles.container}>
      <div>
        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.sectionTitle}>API Keys</h2>
            <p className={styles.sectionDescription}>
              Manage your provider API keys. Keys are encrypted locally with AES-256-GCM.
            </p>
          </div>
          <button
            className={styles.lockButton}
            onClick={lockVault}
            type="button"
            aria-label="Lock vault"
          >
            <Lock size={14} aria-hidden="true" />
            Lock
          </button>
        </div>
      </div>

      <div className={styles.providerList}>
        {keyRecords.map((record) => {
          const meta = PROVIDER_META[record.providerId];
          return (
            <div key={record.providerId} className={styles.providerRow}>
              <span
                className={styles.providerDot}
                style={{ background: `var(${meta.colorVar})` }}
                aria-hidden="true"
              />
              <span className={styles.providerName}>{meta.displayName}</span>
              <span className={styles.keyHint}>{record.displayHint}</span>
              <span className={styles.statusBadge} data-status={record.healthStatus}>
                {record.healthStatus}
              </span>
              <div className={styles.actions}>
                <button
                  className={styles.actionButton}
                  data-variant="danger"
                  onClick={() => handleRemoveKey(record.providerId)}
                  aria-label={`Remove ${meta.displayName} key`}
                  type="button"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}

        {showAddForm ? (
          <form className={styles.addKeyForm} onSubmit={handleAddKey}>
            <div className={styles.addKeyHeader}>
              <Key size={16} aria-hidden="true" style={{ color: 'var(--color-text-2)' }} />
              <select
                className={styles.providerSelect}
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value as ProviderId);
                  setValidationError(null);
                }}
              >
                {unconfiguredProviders.map(([id, meta]) => (
                  <option key={id} value={id}>{meta.displayName}</option>
                ))}
                {/* Allow re-adding existing providers (will overwrite) */}
                {PROVIDER_LIST.filter(([id]) => configuredProviders.has(id)).map(([id, meta]) => (
                  <option key={id} value={id}>{meta.displayName} (replace)</option>
                ))}
              </select>
            </div>
            <input
              ref={keyInputRef}
              type="password"
              className={styles.keyInput}
              data-error={!!validationError}
              value={keyValue}
              onChange={(e) => { setKeyValue(e.target.value); setValidationError(null); }}
              placeholder={`Paste your ${PROVIDER_META[selectedProvider].displayName} API key`}
              autoComplete="off"
              disabled={saving}
              aria-label="API key"
            />
            {validationError && (
              <p className={styles.validationError}>{validationError}</p>
            )}
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => { setShowAddForm(false); setKeyValue(''); setValidationError(null); }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.saveButton}
                disabled={!keyValue || saving}
              >
                {saving ? <Spinner size={14} /> : null}
                Encrypt &amp; Save
              </button>
            </div>
          </form>
        ) : (
          <button
            className={styles.addButton}
            onClick={() => setShowAddForm(true)}
            type="button"
          >
            <Plus size={16} aria-hidden="true" />
            Add API Key
          </button>
        )}
      </div>
    </div>
  );
}
