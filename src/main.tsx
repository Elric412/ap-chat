import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enableMapSet } from 'immer';
import { App } from './App';
import './globals.css';

// Enable Immer MapSet plugin before any store initialization
enableMapSet();

// Restore glassmorphism preference on load (default: standard)
try {
  const glass = localStorage.getItem('byok-glassmorphism');
  // Default to 'standard' if never set
  const level = glass || 'standard';
  if (level === 'off') {
    document.documentElement.removeAttribute('data-glass');
  } else {
    document.documentElement.setAttribute('data-glass', level);
  }
} catch { /* noop */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
