import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Palette, SlidersHorizontal, Key, Shield, Info,
  Lock, Sun, Moon, Monitor, Fingerprint, Eye,
  LogOut, LogIn, Sparkles, Zap, MessageSquare, Code2,
  Type, Globe, BellRing, Trash2, Download, Upload,
  Clock, Database, Languages,
} from 'lucide-react';
import { KeyManagement } from '../components/vault/KeyManagement';
import { SystemPromptEditor } from '../components/system-prompt/SystemPromptEditor';
import { useTheme } from '../hooks/use-theme';
import { useAuth } from '../hooks/use-auth';
import { useAppStore } from '../store';
import { MODEL_REGISTRY } from '../constants/model-registry';
import { Slider } from '../components/ui/slider';
import type { ThemeMode, DensityMode } from '../types/ui';
import styles from './SettingsPage.module.css';

type SettingsTab = 'appearance' | 'behaviour' | 'api-keys' | 'security' | 'about';

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'behaviour', label: 'Behaviour', icon: SlidersHorizontal },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
];

// ─── Animation speed ───
const ANIM_SPEED_KEY = 'byok-anim-speed';
type AnimSpeed = 'instant' | 'fast' | 'normal' | 'relaxed';

function getStoredAnimSpeed(): AnimSpeed {
  try {
    const v = localStorage.getItem(ANIM_SPEED_KEY);
    if (v === 'instant' || v === 'fast' || v === 'normal' || v === 'relaxed') return v;
  } catch { /* noop */ }
  return 'normal';
}

// ─── Behaviour preferences ───
const BEHAVIOUR_KEY = 'byok-behaviour';
interface BehaviourPrefs {
  streamResponses: boolean;
  showThinking: boolean;
  autoTitle: boolean;
  codeWrap: boolean;
  markdownRendering: boolean;
  compactMessages: boolean;
  sendWithEnter: boolean;
  codeHighlighting: boolean;
  enableNotifications: boolean;
  locale: string;
}

const defaultBehaviour: BehaviourPrefs = {
  streamResponses: true,
  showThinking: true,
  autoTitle: true,
  codeWrap: false,
  markdownRendering: true,
  compactMessages: false,
  sendWithEnter: true,
  codeHighlighting: true,
  enableNotifications: false,
  locale: 'en',
};

function getStoredBehaviour(): BehaviourPrefs {
  try {
    const v = localStorage.getItem(BEHAVIOUR_KEY);
    if (v) return { ...defaultBehaviour, ...JSON.parse(v) };
  } catch { /* noop */ }
  return defaultBehaviour;
}

// ─── Security prefs ───
const SECURITY_KEY = 'byok-security';
interface SecurityPrefs {
  autoLock: boolean;
  autoLockMinutes: number;
  clearOnClose: boolean;
  redactSensitive: boolean;
  disableExternalRequests: boolean;
}

const defaultSecurity: SecurityPrefs = {
  autoLock: true,
  autoLockMinutes: 15,
  clearOnClose: false,
  redactSensitive: true,
  disableExternalRequests: false,
};

function getStoredSecurity(): SecurityPrefs {
  try {
    const v = localStorage.getItem(SECURITY_KEY);
    if (v) return { ...defaultSecurity, ...JSON.parse(v) };
  } catch { /* noop */ }
  return defaultSecurity;
}

// ─── Toggle component ───
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      className={styles.toggle}
      data-on={on}
      data-disabled={disabled}
      onClick={onToggle}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
    >
      <span className={styles.toggleDot} />
    </button>
  );
}

// ─── Option Row ───
function OptionRow({ icon: Icon, label, description, children }: {
  icon: typeof Sun;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.optionRow}>
      <div className={styles.optionIcon}>
        <Icon size={15} aria-hidden="true" />
      </div>
      <div className={styles.optionInfo}>
        <span className={styles.optionLabel}>{label}</span>
        {description && <span className={styles.optionDescription}>{description}</span>}
      </div>
      <div className={styles.optionControl}>
        {children}
      </div>
    </div>
  );
}

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as SettingsTab) || 'appearance';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const density = useAppStore((s) => s.density);
  const setDensity = useAppStore((s) => s.setDensity);
  const conversations = useAppStore((s) => s.conversations);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const inferenceParams = useAppStore((s) => s.inferenceParams);
  const setInferenceParams = useAppStore((s) => s.setInferenceParams);

  const [animSpeed, setAnimSpeedState] = useState<AnimSpeed>(getStoredAnimSpeed);
  const [behaviour, setBehaviourState] = useState<BehaviourPrefs>(getStoredBehaviour);
  const [security, setSecurityState] = useState<SecurityPrefs>(getStoredSecurity);

  const totalModels = MODEL_REGISTRY.filter((m) => !m.deprecated).length;
  const providerCount = new Set(MODEL_REGISTRY.map((m) => m.providerId)).size;

  // Sync tab from URL on mount / URL change
  useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab;
    if (tab && TABS.some((t) => t.id === tab)) setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  }, [setSearchParams]);

  const setAnimSpeed = useCallback((speed: AnimSpeed) => {
    setAnimSpeedState(speed);
    try { localStorage.setItem(ANIM_SPEED_KEY, speed); } catch { /* noop */ }
    document.documentElement.setAttribute('data-anim-speed', speed);
  }, []);

  const updateBehaviour = useCallback((patch: Partial<BehaviourPrefs>) => {
    setBehaviourState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(BEHAVIOUR_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const updateSecurity = useCallback((patch: Partial<SecurityPrefs>) => {
    setSecurityState((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(SECURITY_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const displayName = user?.email?.split('@')[0] ?? 'Guest';

  return (
    <div className={styles.settingsPage}>
      {/* Header */}
      <div className={styles.settingsHeader}>
        <button
          className={styles.backBtn}
          onClick={() => navigate(-1)}
          type="button"
          aria-label="Back"
        >
          <ArrowLeft size={15} />
          <span>Back</span>
        </button>
        <h1 className={styles.pageTitle}>Settings</h1>
      </div>

      {/* Tab nav */}
      <div className={styles.tabNav} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={styles.tabBtn}
            data-active={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
          >
            <tab.icon size={14} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={activeTab}
          className={styles.settingsContent}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="tabpanel"
        >
          {activeTab === 'appearance' && (
            <AppearanceTab
              theme={theme}
              resolvedTheme={resolvedTheme}
              setTheme={setTheme}
              density={density}
              setDensity={setDensity}
              animSpeed={animSpeed}
              setAnimSpeed={setAnimSpeed}
            />
          )}
          {activeTab === 'behaviour' && (
            <BehaviourTab
              behaviour={behaviour}
              updateBehaviour={updateBehaviour}
              inferenceParams={inferenceParams}
              setInferenceParams={setInferenceParams}
              activeConversationId={activeConversationId}
            />
          )}
          {activeTab === 'api-keys' && <ApiKeysTab />}
          {activeTab === 'security' && (
            <SecurityTab
              security={security}
              updateSecurity={updateSecurity}
              vaultStatus={vaultStatus}
            />
          )}
          {activeTab === 'about' && (
            <AboutTab
              totalModels={totalModels}
              providerCount={providerCount}
              totalConversations={conversations.length}
              configuredProviders={keyRecords.length}
              user={user}
              displayName={displayName}
              onSignOut={() => void signOut()}
              onSignIn={() => navigate('/auth')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Appearance Tab
   ═══════════════════════════════════════════════════════ */
function AppearanceTab({
  theme, resolvedTheme, setTheme, density, setDensity, animSpeed, setAnimSpeed,
}: {
  theme: ThemeMode; resolvedTheme: string; setTheme: (t: ThemeMode) => void;
  density: DensityMode; setDensity: (d: DensityMode) => void;
  animSpeed: AnimSpeed; setAnimSpeed: (s: AnimSpeed) => void;
}) {
  const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const densityOptions: { value: DensityMode; label: string }[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
    { value: 'spacious', label: 'Spacious' },
  ];

  const animOptions: { value: AnimSpeed; label: string }[] = [
    { value: 'instant', label: 'Instant' },
    { value: 'fast', label: 'Fast' },
    { value: 'normal', label: 'Normal' },
    { value: 'relaxed', label: 'Relaxed' },
  ];

  return (
    <div className={styles.section}>
      {/* Theme */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Theme</span>
        <OptionRow icon={Palette} label="Color mode" description={`Currently: ${resolvedTheme}${theme === 'system' ? ' (auto)' : ''}`}>
          <div className={styles.pillGroup}>
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                className={styles.pill}
                data-active={theme === opt.value}
                onClick={() => setTheme(opt.value)}
                type="button"
              >
                <opt.icon size={13} aria-hidden="true" />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </OptionRow>
      </div>

      {/* Density */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Layout</span>
        <OptionRow icon={Type} label="Interface density" description="Adjust spacing between elements">
          <div className={styles.pillGroup}>
            {densityOptions.map((opt) => (
              <button
                key={opt.value}
                className={styles.pill}
                data-active={density === opt.value}
                onClick={() => setDensity(opt.value)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </OptionRow>
      </div>

      {/* Animation speed */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Motion</span>
        <OptionRow icon={Zap} label="Animation speed" description="Control transition timing globally">
          <div className={styles.pillGroup}>
            {animOptions.map((opt) => (
              <button
                key={opt.value}
                className={styles.pill}
                data-active={animSpeed === opt.value}
                onClick={() => setAnimSpeed(opt.value)}
                type="button"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </OptionRow>
      </div>

      <div className={styles.infoNote}>
        <Info size={13} aria-hidden="true" />
        <span>
          Respects <code>prefers-reduced-motion</code>. "Instant" disables all motion.
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Behaviour Tab
   ═══════════════════════════════════════════════════════ */
function BehaviourTab({
  behaviour, updateBehaviour, inferenceParams, setInferenceParams, activeConversationId,
}: {
  behaviour: BehaviourPrefs;
  updateBehaviour: (p: Partial<BehaviourPrefs>) => void;
  inferenceParams: { temperature: number; topP: number; maxOutputTokens: number | null };
  setInferenceParams: (p: any) => void;
  activeConversationId: string | null;
}) {
  return (
    <div className={styles.section}>
      {/* Response */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Response</span>
        <OptionRow icon={Zap} label="Stream responses" description="Show tokens as they arrive">
          <Toggle on={behaviour.streamResponses} onToggle={() => updateBehaviour({ streamResponses: !behaviour.streamResponses })} />
        </OptionRow>
        <OptionRow icon={Sparkles} label="Show thinking" description="Display model reasoning steps">
          <Toggle on={behaviour.showThinking} onToggle={() => updateBehaviour({ showThinking: !behaviour.showThinking })} />
        </OptionRow>
        <OptionRow icon={MessageSquare} label="Auto-generate title" description="Name chats from first message">
          <Toggle on={behaviour.autoTitle} onToggle={() => updateBehaviour({ autoTitle: !behaviour.autoTitle })} />
        </OptionRow>
      </div>

      {/* Input */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Input</span>
        <OptionRow icon={Globe} label="Send with Enter" description="Shift+Enter for newline">
          <Toggle on={behaviour.sendWithEnter} onToggle={() => updateBehaviour({ sendWithEnter: !behaviour.sendWithEnter })} />
        </OptionRow>
        <OptionRow icon={Languages} label="Language" description="Interface locale">
          <select
            className={styles.select}
            value={behaviour.locale}
            onChange={(e) => updateBehaviour({ locale: e.target.value })}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="ja">日本語</option>
            <option value="zh">中文</option>
          </select>
        </OptionRow>
      </div>

      {/* Display */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Display</span>
        <OptionRow icon={Code2} label="Wrap code blocks" description="Wrap long lines instead of scrolling">
          <Toggle on={behaviour.codeWrap} onToggle={() => updateBehaviour({ codeWrap: !behaviour.codeWrap })} />
        </OptionRow>
        <OptionRow icon={Code2} label="Syntax highlighting" description="Highlight code in responses">
          <Toggle on={behaviour.codeHighlighting} onToggle={() => updateBehaviour({ codeHighlighting: !behaviour.codeHighlighting })} />
        </OptionRow>
        <OptionRow icon={Type} label="Markdown rendering" description="Render formatted markdown">
          <Toggle on={behaviour.markdownRendering} onToggle={() => updateBehaviour({ markdownRendering: !behaviour.markdownRendering })} />
        </OptionRow>
        <OptionRow icon={MessageSquare} label="Compact messages" description="Reduce vertical spacing">
          <Toggle on={behaviour.compactMessages} onToggle={() => updateBehaviour({ compactMessages: !behaviour.compactMessages })} />
        </OptionRow>
        <OptionRow icon={BellRing} label="Notifications" description="Browser notifications for completions">
          <Toggle on={behaviour.enableNotifications} onToggle={() => updateBehaviour({ enableNotifications: !behaviour.enableNotifications })} />
        </OptionRow>
      </div>

      {/* Model defaults */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Default parameters</span>
        <div className={styles.sliderRow}>
          <div className={styles.sliderHeader}>
            <span className={styles.optionLabel}>Temperature</span>
            <span className={styles.sliderValue}>{inferenceParams.temperature.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={[inferenceParams.temperature]}
            onValueChange={([v]) => setInferenceParams({ ...inferenceParams, temperature: v })}
          />
          <span className={styles.optionDescription}>Lower = focused · Higher = creative</span>
        </div>
        <div className={styles.sliderRow}>
          <div className={styles.sliderHeader}>
            <span className={styles.optionLabel}>Top P</span>
            <span className={styles.sliderValue}>{inferenceParams.topP.toFixed(2)}</span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[inferenceParams.topP]}
            onValueChange={([v]) => setInferenceParams({ ...inferenceParams, topP: v })}
          />
          <span className={styles.optionDescription}>Nucleus sampling threshold</span>
        </div>
      </div>

      {/* System prompt */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>System prompt</span>
        <SystemPromptEditor conversationId={activeConversationId} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   API Keys Tab
   ═══════════════════════════════════════════════════════ */
function ApiKeysTab() {
  return (
    <div className={styles.section}>
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Provider keys</span>
        <KeyManagement />
      </div>
      <div className={styles.infoNote}>
        <Shield size={13} aria-hidden="true" />
        <span>
          Keys encrypted with AES-256-GCM · Argon2id KDF. Never leaves your browser.
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Security Tab
   ═══════════════════════════════════════════════════════ */
function SecurityTab({
  security, updateSecurity, vaultStatus,
}: {
  security: SecurityPrefs;
  updateSecurity: (p: Partial<SecurityPrefs>) => void;
  vaultStatus: string;
}) {
  const lockVault = useAppStore((s) => s.lockVault);

  return (
    <div className={styles.section}>
      {/* Vault status */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Vault</span>
        <div className={styles.securityCard}>
          <div className={styles.securityHeader}>
            <Fingerprint size={16} className={styles.securityIcon} aria-hidden="true" />
            <span className={styles.securityTitle}>Encryption vault</span>
            <div className={styles.securityBadge}>
              <Lock size={10} aria-hidden="true" />
              {vaultStatus}
            </div>
          </div>
          <span className={styles.securityDesc}>
            AES-256-GCM encryption with Argon2id key derivation. All keys stored locally.
          </span>
          {vaultStatus === 'unlocked' && (
            <button className={styles.actionBtn} onClick={lockVault} type="button">
              <Lock size={13} aria-hidden="true" />
              Lock vault now
            </button>
          )}
        </div>
      </div>

      {/* Session protection */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Session</span>
        <OptionRow icon={Clock} label="Auto-lock vault" description="Lock after inactivity">
          <Toggle on={security.autoLock} onToggle={() => updateSecurity({ autoLock: !security.autoLock })} />
        </OptionRow>
        {security.autoLock && (
          <div className={styles.sliderRow}>
            <div className={styles.sliderHeader}>
              <span className={styles.optionLabel}>Lock timeout</span>
              <span className={styles.sliderValue}>{security.autoLockMinutes} min</span>
            </div>
            <Slider
              min={1}
              max={60}
              step={1}
              value={[security.autoLockMinutes]}
              onValueChange={([v]) => updateSecurity({ autoLockMinutes: v })}
            />
          </div>
        )}
        <OptionRow icon={Trash2} label="Clear on close" description="Erase session data on exit">
          <Toggle on={security.clearOnClose} onToggle={() => updateSecurity({ clearOnClose: !security.clearOnClose })} />
        </OptionRow>
      </div>

      {/* Privacy */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Privacy</span>
        <OptionRow icon={Eye} label="Redact sensitive data" description="Auto-redact keys & emails in errors">
          <Toggle on={security.redactSensitive} onToggle={() => updateSecurity({ redactSensitive: !security.redactSensitive })} />
        </OptionRow>
        <OptionRow icon={Globe} label="Block external requests" description="Prevent third-party network calls">
          <Toggle on={security.disableExternalRequests} onToggle={() => updateSecurity({ disableExternalRequests: !security.disableExternalRequests })} />
        </OptionRow>
      </div>

      {/* Architecture info */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Architecture</span>
        <div className={styles.securityCard}>
          <div className={styles.securityHeader}>
            <Shield size={15} className={styles.securityIcon} aria-hidden="true" />
            <span className={styles.securityTitle}>Zero-knowledge</span>
          </div>
          <span className={styles.securityDesc}>
            All encryption runs locally. No passwords or API keys are ever transmitted.
            5 failed attempts trigger a 15-minute lockout.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   About Tab
   ═══════════════════════════════════════════════════════ */
function AboutTab({
  totalModels, providerCount, totalConversations, configuredProviders,
  user, displayName, onSignOut, onSignIn,
}: {
  totalModels: number; providerCount: number;
  totalConversations: number; configuredProviders: number;
  user: any; displayName: string;
  onSignOut: () => void; onSignIn: () => void;
}) {
  const handleExport = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      behaviour: getStoredBehaviour(),
      security: getStoredSecurity(),
      animSpeed: getStoredAnimSpeed(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'byok-settings-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className={styles.section}>
      {/* Account */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Account</span>
        {user ? (
          <div className={styles.signOutRow}>
            <div className={styles.signOutInfo}>
              <span className={styles.signOutEmail}>{user.email}</span>
              <span className={styles.signOutHint}>Signed in as {displayName}</span>
            </div>
            <button className={styles.signOutBtn} onClick={onSignOut} type="button">
              <LogOut size={13} aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : (
          <OptionRow icon={LogIn} label="Not signed in" description="Sign in to sync across devices">
            <button className={styles.actionBtnSmall} onClick={onSignIn} type="button">
              Sign in
            </button>
          </OptionRow>
        )}
      </div>

      {/* Stats */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Statistics</span>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{providerCount}</span>
            <span className={styles.statLabel}>Providers</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totalModels}</span>
            <span className={styles.statLabel}>Models</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totalConversations}</span>
            <span className={styles.statLabel}>Chats</span>
          </div>
        </div>
      </div>

      {/* Data */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Data</span>
        <OptionRow icon={Download} label="Export settings" description="Download preferences as JSON">
          <button className={styles.actionBtnSmall} onClick={handleExport} type="button">
            Export
          </button>
        </OptionRow>
        <OptionRow icon={Database} label="Storage" description="All data stored locally in IndexedDB">
          <span className={styles.storageBadge}>Local only</span>
        </OptionRow>
      </div>

      {/* Info */}
      <div className={styles.infoNote}>
        <Sparkles size={13} aria-hidden="true" />
        <span>
          <strong>BYOK Chat</strong> — Multi-model AI chat with your own API keys.
          Zero tracking, zero server storage.
        </span>
      </div>
    </div>
  );
}
