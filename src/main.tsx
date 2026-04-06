import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { App } from './App';
import './globals.css';

// Enable Immer MapSet plugin before any store initialization
enableMapSet();

// Restore glassmorphism preference on load (default: enabled)
try {
  const glass = localStorage.getItem('byok-glassmorphism');
  // Default to true if never set
  if (glass === null || glass === 'true') {
    document.documentElement.setAttribute('data-glass', 'true');
  }
} catch { /* noop */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
