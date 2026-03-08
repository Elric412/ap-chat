import { type ReactNode, useEffect } from 'react';
import { useAppStore } from '../../store';
import { useMediaQuery } from '../../hooks/use-media-query';
import { CanvasPanel } from '../canvas/CanvasPanel';
import { NetworkBanner } from '../shared/NetworkBanner';
import styles from './AppShell.module.css';

interface AppShellProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, header, children }: AppShellProps): JSX.Element {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const focusMode = useAppStore((s) => s.focusMode);
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const setSidebarCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(max-width: 1023px)');

  /* Auto-collapse sidebar at tablet, hide at mobile */
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
    setSidebarCollapsed(isTablet && !isMobile);
  }, [isMobile, isTablet, setSidebarOpen, setSidebarCollapsed]);

  const sidebarHidden = !sidebarOpen || focusMode;

  return (
    <div className={`${styles.shell} noise-overlay`} data-focus-mode={focusMode} data-canvas={canvasOpen}>
      {/* Skip navigation link for keyboard/screen reader users */}
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>

      <aside
        className={styles.sidebarRegion}
        data-collapsed={sidebarCollapsed}
        data-hidden={sidebarHidden}
        aria-label="Conversation sidebar"
      >
        {sidebar}
      </aside>

      <div className={styles.mainRegion} role="main" id="main-content">
        <NetworkBanner />
        {!focusMode && header}
        <div className={styles.contentArea}>
          {children}
        </div>
      </div>

      {canvasOpen && (
        <aside className={styles.canvasRegion} aria-label="Artifact canvas">
          <CanvasPanel />
        </aside>
      )}

      {/* Live region for streaming status announcements */}
      <div
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        id="stream-status"
      />
    </div>
  );
}
