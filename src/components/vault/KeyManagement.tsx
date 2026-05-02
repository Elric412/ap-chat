import { useState, useRef } from 'react';
import { Plus, Trash2, Lock, Key, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store';
import { PROVIDER_META } from '../../constants/provider-meta';
import { validateApiKeyInput } from '../../lib/api-key-validation';
import { PROVIDER_IDS, type ProviderId } from '../../types/models';
import { Spinner } from '../shared/Spinner';
import styles from './KeyManagement.module.css';

const PROVIDER_LIST = Object.entries(PROVIDER_META) as [ProviderId, typeof PROVIDER_META[ProviderId]][];

export function KeyManagement(): JSX.Element {
  const keyRecords = useAppStore((s) => s.keyRecords);
  const addKey = useAppStore((s) => s.addKey);
  const removeKey = useAppStore((s) => s.removeKey);
  const lockVault = useAppStore((s) => s.lockVault);
  const verifyKey = useAppStore((s) => s.verifyKey);
  const verifyingKey = useAppStore((s) => s.verifyingKey);
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

    const validation = validateApiKeyInput(keyValue, selectedProvider);
    const meta = PROVIDER_META[selectedProvider];

    if (!validation.valid) {
      setValidationError(validation.error ?? 'Invalid API key');
      return;
    }

    setSaving(true);
    try {
      await addKey(selectedProvider, validation.sanitizedKey);
      setKeyValue('');
      setShowAddForm(false);

      // Auto-verify the key right after saving
      addToast({
        type: 'info',
        title: `Verifying ${meta.displayName} key…`,
        description: 'Connecting to provider to validate your API key.',
        dismissible: true,
      });

      const result = await verifyKey(selectedProvider);

      if (result === 'healthy') {
        addToast({
          type: 'success',
          title: `${meta.displayName} connected successfully`,
          description: 'API key is valid and working.',
          dismissible: true,
        });
      } else {
        addToast({
          type: 'error',
          title: `${meta.displayName} key invalid`,
          description: 'Could not authenticate with this API key. Please check it and try again.',
          dismissible: true,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to encrypt and store key';
      setValidationError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyKey = async (providerId: ProviderId): Promise<void> => {
    const meta = PROVIDER_META[providerId];
    const result = await verifyKey(providerId);

    if (result === 'healthy') {
      addToast({
        type: 'success',
        title: `${meta.displayName} connected`,
        description: 'API key verified successfully.',
        dismissible: true,
      });
    } else {
      addToast({
        type: 'error',
        title: `${meta.displayName} verification failed`,
        description: 'API key is invalid or expired. Please replace it.',
        dismissible: true,
      });
    }
  };

  const handleRemoveKey = async (providerId: ProviderId): Promise<void> => {
    const meta = PROVIDER_META[providerId];
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
          const isVerifying = verifyingKey === record.providerId;
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
                {record.healthStatus === 'healthy' && <ShieldCheck size={12} />}
                {record.healthStatus}
              </span>
              <div className={styles.actions}>
                <button
                  className={styles.actionButton}
                  data-variant="verify"
                  onClick={() => handleVerifyKey(record.providerId)}
                  disabled={isVerifying}
                  aria-label={`Verify ${meta.displayName} key`}
                  title="Verify API key"
                  type="button"
                >
                  {isVerifying ? <Spinner size={14} /> : <RefreshCw size={14} aria-hidden="true" />}
                </button>
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
                {saving ? <Spinner size={14} /> : <ShieldCheck size={14} />}
                Encrypt, Save &amp; Verify
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
