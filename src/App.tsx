import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTheme } from './hooks/use-theme';
import { useKeyboard } from './hooks/use-keyboard';
import { useAppStore } from './store';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { VaultSetupModal } from './components/vault/VaultSetupModal';
import { VaultUnlockModal } from './components/vault/VaultUnlockModal';
import { ToastStack } from './components/shared/ToastStack';
import { ParameterDrawer } from './components/parameters/ParameterDrawer';

function AppInner(): JSX.Element {
  useTheme();
  useKeyboard();

  const initVault = useAppStore((s) => s.initVault);
  const vaultStatus = useAppStore((s) => s.vaultStatus);

  /* Initialize vault status on mount */
  useEffect(() => {
    initVault();
  }, [initVault]);

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
          <Route path="*" element={<ChatPage />} />
        </Routes>
      </AppShell>
      <VaultSetupModal />
      <VaultUnlockModal />
      <ParameterDrawer />
      <ToastStack />
    </>
  );
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

export default App;
