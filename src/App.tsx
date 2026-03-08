import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAutoSave } from './hooks/use-auto-save';
import { useTheme } from './hooks/use-theme';
import { useKeyboard } from './hooks/use-keyboard';
import { useAppStore } from './store';
import { AuthProvider } from './hooks/use-auth';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';
import { VaultSetupModal } from './components/vault/VaultSetupModal';
import { VaultUnlockModal } from './components/vault/VaultUnlockModal';
import { ToastStack } from './components/shared/ToastStack';
import { ParameterDrawer } from './components/parameters/ParameterDrawer';
import { CommandPalette } from './components/command/CommandPalette';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { exportAsMarkdown, exportAsJson, downloadFile } from './engine/export-engine';

function AppInner(): JSX.Element {
  useTheme();
  const { commandPaletteOpen, setCommandPaletteOpen } = useKeyboard();

  const initVault = useAppStore((s) => s.initVault);

  useEffect(() => {
    initVault();
  }, [initVault]);

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
      <AppShell
        sidebar={<Sidebar />}
        header={<Header />}
      >
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<ChatPage />} />
        </Routes>
      </AppShell>
      <VaultSetupModal />
      <VaultUnlockModal />
      <ParameterDrawer />
      <ToastStack />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
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
