import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAutoSave } from './hooks/use-auto-save';
import { useTheme } from './hooks/use-theme';
import { useKeyboard } from './hooks/use-keyboard';
import { useAppStore } from './store';
import { AuthProvider } from './hooks/use-auth';
import { AppShell } from './components/layout/AppShell';
import { ToastStack } from './components/shared/ToastStack';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { exportAsMarkdown, exportAsJson, downloadFile } from './engine/export-engine';

const Sidebar = lazy(() => import('./components/layout/Sidebar').then((module) => ({ default: module.Sidebar })));
const Header = lazy(() => import('./components/layout/Header').then((module) => ({ default: module.Header })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((module) => ({ default: module.ChatPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const VaultSetupModal = lazy(() => import('./components/vault/VaultSetupModal').then((module) => ({ default: module.VaultSetupModal })));
const VaultUnlockModal = lazy(() => import('./components/vault/VaultUnlockModal').then((module) => ({ default: module.VaultUnlockModal })));
const ParameterDrawer = lazy(() => import('./components/parameters/ParameterDrawer').then((module) => ({ default: module.ParameterDrawer })));
const CommandPalette = lazy(() => import('./components/command/CommandPalette').then((module) => ({ default: module.CommandPalette })));
const SkillLibraryPanel = lazy(() => import('./components/skills/SkillLibraryPanel').then((module) => ({ default: module.SkillLibraryPanel })));

function AppInner(): JSX.Element {
  useTheme();
  const { commandPaletteOpen, setCommandPaletteOpen } = useKeyboard();
  useAutoSave();
  const location = useLocation();

  const initVault = useAppStore((s) => s.initVault);
  const initSkills = useAppStore((s) => s.initSkills);

  useEffect(() => {
    initVault();
    initSkills();
  }, [initVault, initSkills]);

  // Listen for export events dispatched from command palette
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { format: string } | undefined;
      if (!detail) return;

      const store = useAppStore.getState();
      const convId = store.activeConversationId;
      const conv = store.conversations.find((c) => c.id === convId);
      if (!conv) {
        store.addToast({ type: 'warning', title: 'No conversation to export', dismissible: true });
        return;
      }

      const messages = store.getActiveBranchMessages();
      if (messages.length === 0) {
        store.addToast({ type: 'warning', title: 'No messages to export', dismissible: true });
        return;
      }

      if (detail.format === 'markdown') {
        const md = exportAsMarkdown(conv, messages);
        const safeName = conv.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
        downloadFile(md, `${safeName || 'conversation'}.md`, 'text/markdown');
        store.addToast({ type: 'success', title: 'Exported as Markdown', dismissible: true });
      } else if (detail.format === 'json') {
        const json = exportAsJson(conv, messages);
        const safeName = conv.title.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '-');
        downloadFile(json, `${safeName || 'conversation'}.json`, 'application/json');
        store.addToast({ type: 'success', title: 'Exported as JSON', dismissible: true });
      }
    };

    document.addEventListener('byok:export', handler);
    return () => document.removeEventListener('byok:export', handler);
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <AppShell
          sidebar={<Sidebar />}
          header={<Header />}
        >
          <AnimatePresence mode="popLayout">
            <motion.div
              key={location.pathname.startsWith('/settings') ? 'settings' : location.pathname.startsWith('/auth') ? 'auth' : 'chat'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <Routes location={location}>
                <Route path="/" element={<ChatPage />} />
                <Route path="/chat/:conversationId" element={<ChatPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="*" element={<ChatPage />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </AppShell>
        <VaultSetupModal />
        <VaultUnlockModal />
        <ParameterDrawer />
        <SkillLibraryPanel />
      </Suspense>
      <ToastStack />
      <Suspense fallback={null}>
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />
      </Suspense>
    </>
  );
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppInner />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
