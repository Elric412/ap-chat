import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { App } from './App';
import './globals.css';

// Enable Immer MapSet plugin before any store initialization
enableMapSet();

// Restore glassmorphism preference on load
try {
  if (localStorage.getItem('byok-glassmorphism') === 'true') {
    document.documentElement.setAttribute('data-glass', 'true');
  }
} catch { /* noop */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
