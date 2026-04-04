import { useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Palette, SlidersHorizontal, Key, Shield, BookOpen,
  Info, Lock, Sun, Moon, Monitor, ChevronDown, Fingerprint,
  RefreshCw, Eye, EyeOff, Zap, MessageSquare, Sparkles,
  LogOut, LogIn, User,
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

type Ease4 = [number, number, number, number];
const EASE_OUT_EXPO: Ease4 = [0.16, 1, 0.3, 1];

type SettingsTab = 'appearance' | 'behaviour' | 'api-keys' | 'security' | 'about';

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'behaviour', label: 'Behaviour', icon: SlidersHorizontal },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
];

const contentVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

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
}

function getStoredBehaviour(): BehaviourPrefs {
  try {
    const v = localStorage.getItem(BEHAVIOUR_KEY);
    if (v) return { ...defaultBehaviour, ...JSON.parse(v) };
  } catch { /* noop */ }
  return defaultBehaviour;
}

const defaultBehaviour: BehaviourPrefs = {
  streamResponses: true,
  showThinking: true,
  autoTitle: true,
  codeWrap: false,
  markdownRendering: true,
  compactMessages: false,
};

// ─── Security prefs ───
const SECURITY_KEY = 'byok-security';
interface SecurityPrefs {
  autoLock: boolean;
  autoLockMinutes: number;
  clearOnClose: boolean;
}

function getStoredSecurity(): SecurityPrefs {
  try {
    const v = localStorage.getItem(SECURITY_KEY);
    if (v) return { ...defaultSecurity, ...JSON.parse(v) };
  } catch { /* noop */ }
  return defaultSecurity;
}

const defaultSecurity: SecurityPrefs = {
  autoLock: true,
  autoLockMinutes: 15,
  clearOnClose: false,
};

// ─── Toggle component ───
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      className={styles.toggle}
      data-on={on}
      onClick={onToggle}
      type="button"
      role="switch"
      aria-checked={on}
    >
      <span className={styles.toggleDot} />
    </button>
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
      <motion.div
        className={styles.settingsHeader}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
      >
        <motion.button
          className={styles.backBtn}
          onClick={() => navigate('/')}
          type="button"
          aria-label="Back to chat"
          whileTap={{ scale: 0.97 }}
        >
          <ArrowLeft size={15} />
          <span>Back</span>
        </motion.button>
        <h1 className={styles.pageTitle}>Settings</h1>
      </motion.div>

      {/* Tab nav */}
      <div className={styles.tabNav}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={styles.tabBtn}
            data-active={activeTab === tab.id}
            onClick={() => handleTabChange(tab.id)}
            type="button"
          >
            <tab.icon size={14} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          className={styles.settingsContent}
          variants={contentVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
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
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Color mode</span>
            <span className={styles.optionDescription}>
              Currently: {resolvedTheme} {theme === 'system' ? '(auto)' : ''}
            </span>
          </div>
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
        </div>
      </div>

      {/* Density */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Layout density</span>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Interface density</span>
            <span className={styles.optionDescription}>Adjust spacing between elements</span>
          </div>
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
        </div>
      </div>

      {/* Animation speed */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Motion</span>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Animation speed</span>
            <span className={styles.optionDescription}>Control transition & animation timing</span>
          </div>
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
        </div>
      </div>

      <div className={styles.infoNote}>
        <Info size={14} aria-hidden="true" />
        <span>
          The system respects your OS <code>prefers-reduced-motion</code> setting.
          Setting animation to "Instant" disables all motion effects.
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
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Stream responses</span>
            <span className={styles.optionDescription}>Show tokens as they arrive</span>
          </div>
          <Toggle on={behaviour.streamResponses} onToggle={() => updateBehaviour({ streamResponses: !behaviour.streamResponses })} />
        </div>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Show thinking</span>
            <span className={styles.optionDescription}>Display model reasoning steps</span>
          </div>
          <Toggle on={behaviour.showThinking} onToggle={() => updateBehaviour({ showThinking: !behaviour.showThinking })} />
        </div>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Auto-generate title</span>
            <span className={styles.optionDescription}>Name conversations based on first message</span>
          </div>
          <Toggle on={behaviour.autoTitle} onToggle={() => updateBehaviour({ autoTitle: !behaviour.autoTitle })} />
        </div>
      </div>

      {/* Display */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Display</span>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Wrap code blocks</span>
            <span className={styles.optionDescription}>Wrap long lines instead of scrolling</span>
          </div>
          <Toggle on={behaviour.codeWrap} onToggle={() => updateBehaviour({ codeWrap: !behaviour.codeWrap })} />
        </div>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Markdown rendering</span>
            <span className={styles.optionDescription}>Render formatted markdown in responses</span>
          </div>
          <Toggle on={behaviour.markdownRendering} onToggle={() => updateBehaviour({ markdownRendering: !behaviour.markdownRendering })} />
        </div>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Compact messages</span>
            <span className={styles.optionDescription}>Reduce vertical spacing between messages</span>
          </div>
          <Toggle on={behaviour.compactMessages} onToggle={() => updateBehaviour({ compactMessages: !behaviour.compactMessages })} />
        </div>
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
          <span className={styles.optionDescription}>Lower = more focused, Higher = more creative</span>
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
          <span className={styles.optionDescription}>Nucleus sampling probability threshold</span>
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
      <KeyManagement />
      <div className={styles.infoNote}>
        <Shield size={14} aria-hidden="true" />
        <span>
          API keys are encrypted with AES-256-GCM using a password-derived key (Argon2id / PBKDF2).
          Keys never leave your browser — no server involved.
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
      <div className={styles.securityCard}>
        <div className={styles.securityHeader}>
          <Fingerprint size={18} className={styles.securityIcon} aria-hidden="true" />
          <span className={styles.securityTitle}>Vault Status</span>
        </div>
        <span className={styles.securityDesc}>
          Your encryption vault is currently <strong>{vaultStatus}</strong>.
          The vault protects all stored API keys with AES-256-GCM encryption.
        </span>
        <div className={styles.securityBadge}>
          <Lock size={11} aria-hidden="true" />
          AES-256-GCM · Argon2id KDF
        </div>
        {vaultStatus === 'unlocked' && (
          <button
            className={styles.actionBtn}
            onClick={lockVault}
            type="button"
            style={{ marginTop: 8 }}
          >
            <Lock size={14} aria-hidden="true" />
            Lock vault now
          </button>
        )}
      </div>

      {/* Auto-lock */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Session protection</span>
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Auto-lock vault</span>
            <span className={styles.optionDescription}>Lock vault after period of inactivity</span>
          </div>
          <Toggle on={security.autoLock} onToggle={() => updateSecurity({ autoLock: !security.autoLock })} />
        </div>
        {security.autoLock && (
          <div className={styles.sliderRow}>
            <div className={styles.sliderHeader}>
              <span className={styles.optionLabel}>Lock after</span>
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
        <div className={styles.optionRow}>
          <div>
            <span className={styles.optionLabel}>Clear data on close</span>
            <span className={styles.optionDescription}>Erase session data when browser closes</span>
          </div>
          <Toggle on={security.clearOnClose} onToggle={() => updateSecurity({ clearOnClose: !security.clearOnClose })} />
        </div>
      </div>

      {/* Security info */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>Protection details</span>
        <div className={styles.securityCard}>
          <div className={styles.securityHeader}>
            <Shield size={16} className={styles.securityIcon} aria-hidden="true" />
            <span className={styles.securityTitle}>Zero-knowledge architecture</span>
          </div>
          <span className={styles.securityDesc}>
            All encryption/decryption happens locally in your browser.
            No API keys or passwords are ever transmitted to any server.
            Failed login attempts trigger a 15-minute lockout after 5 tries.
          </span>
        </div>
        <div className={styles.securityCard}>
          <div className={styles.securityHeader}>
            <Eye size={16} className={styles.securityIcon} aria-hidden="true" />
            <span className={styles.securityTitle}>Data sanitization</span>
          </div>
          <span className={styles.securityDesc}>
            API keys, JWTs, and email addresses are automatically redacted
            from error messages and streaming payloads to prevent accidental exposure.
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
              <LogOut size={13} style={{ marginRight: 4, verticalAlign: -2 }} aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : (
          <div className={styles.optionRow}>
            <div>
              <span className={styles.optionLabel}>Not signed in</span>
              <span className={styles.optionDescription}>Sign in to sync data across devices</span>
            </div>
            <button className={styles.actionBtn} onClick={onSignIn} type="button" style={{ width: 'auto' }}>
              <LogIn size={14} aria-hidden="true" />
              Sign in
            </button>
          </div>
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

      {/* Info */}
      <div className={styles.sectionBlock}>
        <span className={styles.sectionLabel}>About</span>
        <div className={styles.infoNote}>
          <Sparkles size={14} aria-hidden="true" />
          <span>
            <strong>BYOK Chat</strong> — Multi-model AI chat with your own API keys.
            All data stored locally in IndexedDB. API keys encrypted with AES-256-GCM.
            No server, no tracking.
          </span>
        </div>
      </div>
    </div>
  );
}
