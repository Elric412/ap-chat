import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTheme } from './hooks/use-theme';
import { useKeyboard } from './hooks/use-keyboard';
import { AppShell } from './components/layout/AppShell';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { ChatPage } from './pages/ChatPage';

function AppInner(): JSX.Element {
  useTheme();
  useKeyboard();

  return (
    <AppShell
      sidebar={<Sidebar />}
      header={<Header />}
    >
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="*" element={<ChatPage />} />
      </Routes>
    </AppShell>
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
