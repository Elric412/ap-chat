import { type ReactNode, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

type Ease4 = [number, number, number, number];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];
const EASE_MECH: Ease4 = [0.22, 0.68, 0.28, 1.0];

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25, ease: EASE_SILK } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: EASE_MECH } },
};

const sidebarMobileVariants = {
  hidden: { x: '-100%', transition: { duration: 0.3, ease: EASE_MECH } },
  visible: { x: 0, transition: { duration: 0.35, ease: EASE_OUT } },
};

const canvasVariants = {
  hidden: { opacity: 0, x: 40, transition: { duration: 0.25, ease: EASE_MECH } },
  visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

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

  const handleOverlayClick = useCallback(() => {
    if (isMobile && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isMobile, sidebarOpen, setSidebarOpen]);

  const sidebarHidden = !sidebarOpen || focusMode;

  return (
    <div className={styles.shell} data-focus-mode={focusMode} data-canvas={canvasOpen}>
      {/* Skip navigation link for keyboard/screen reader users */}
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            className={styles.sidebarOverlay}
            onClick={handleOverlayClick}
            aria-hidden="true"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
        )}
      </AnimatePresence>

      {isMobile ? (
        <motion.aside
          className={styles.sidebarRegion}
          data-collapsed={sidebarCollapsed}
          data-hidden={sidebarHidden}
          data-mobile={true}
          aria-label="Conversation sidebar"
          variants={sidebarMobileVariants}
          initial={false}
          animate={sidebarHidden ? 'hidden' : 'visible'}
        >
          {sidebar}
        </motion.aside>
      ) : (
        <aside
          className={styles.sidebarRegion}
          data-collapsed={sidebarCollapsed}
          data-hidden={sidebarHidden}
          data-mobile={false}
          aria-label="Conversation sidebar"
        >
          {sidebar}
        </aside>
      )}

      <div className={styles.mainRegion} role="main" id="main-content">
        <NetworkBanner />
        {!focusMode && header}
        <div className={styles.contentArea}>
          {children}
        </div>
      </div>

      <AnimatePresence>
        {canvasOpen && (
          <motion.aside
            className={styles.canvasRegion}
            aria-label="Artifact canvas"
            variants={canvasVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <CanvasPanel />
          </motion.aside>
        )}
      </AnimatePresence>

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
