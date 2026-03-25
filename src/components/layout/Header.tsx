import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Settings, SlidersHorizontal, PanelRight, Columns2, Globe, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { ModelSelector } from '../models/ModelSelector';
import { useMediaQuery } from '../../hooks/use-media-query';
import { DynamicIsland } from './DynamicIsland';
import styles from './Header.module.css';

type Ease4 = [number, number, number, number];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];

// Spring physics for interactive elements (Taste Skill Section 4)
const springTap = { scale: 0.92, transition: { type: 'spring', stiffness: 500, damping: 30 } };
const springHover = { y: -1, transition: { type: 'spring', stiffness: 400, damping: 25 } };

export function Header(): JSX.Element {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const selectedModelId = useAppStore((s) => s.selectedModelId);
  const paramDrawerOpen = useAppStore((s) => s.paramDrawerOpen);
  const setParamDrawerOpen = useAppStore((s) => s.setParamDrawerOpen);
  const canvasOpen = useAppStore((s) => s.canvasOpen);
  const toggleCanvas = useAppStore((s) => s.toggleCanvas);
  const comparisonMode = useAppStore((s) => s.comparisonMode);
  const setComparisonMode = useAppStore((s) => s.setComparisonMode);
  const webSearchEnabled = useAppStore((s) => s.webSearchEnabled);
  const toggleWebSearch = useAppStore((s) => s.toggleWebSearch);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const navigate = useNavigate();

  const isMobile = useMediaQuery('(max-width: 768px)');

  const model = MODEL_REGISTRY.find((m) => m.id === selectedModelId);
  const providerColor = model ? `var(${PROVIDER_META[model.providerId].colorVar})` : 'var(--color-text-3)';
  const supportsSearch = model?.capabilities.supportsWebSearch ?? false;

  const handleToggleSelector = useCallback(() => {
    setSelectorOpen((prev) => !prev);
  }, []);

  const handleToggleComparison = useCallback(() => {
    setComparisonMode(!comparisonMode);
  }, [comparisonMode, setComparisonMode]);

  return (
    <>
      <motion.header
        className={styles.header}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        {/* Mobile menu toggle */}
        <AnimatePresence>
          {isMobile && !sidebarOpen && (
            <motion.button
              className={styles.menuBtn}
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              whileTap={springTap}
            >
              <Menu size={18} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>

        <motion.button
          className={styles.modelTrigger}
          type="button"
          aria-label="Select model"
          onClick={handleToggleSelector}
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
        >
          <motion.span
            className={styles.providerDot}
            style={{ background: providerColor }}
            aria-hidden="true"
            animate={{ boxShadow: `0 0 8px ${providerColor}` }}
            transition={{ duration: 0.5 }}
          />
          <span className={styles.modelName}>{model?.displayName ?? 'Select model'}</span>
          <motion.span
            animate={{ rotate: selectorOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <ChevronDown size={12} className={styles.chevron} aria-hidden="true" />
          </motion.span>
        </motion.button>

        {/* Web Search toggle */}
        <motion.button
          className={styles.searchToggle}
          type="button"
          aria-label={webSearchEnabled ? 'Disable web search' : 'Enable web search'}
          aria-pressed={webSearchEnabled}
          data-active={webSearchEnabled}
          data-supported={supportsSearch}
          onClick={toggleWebSearch}
          title={supportsSearch
            ? (webSearchEnabled ? 'Web search enabled' : 'Enable web search')
            : 'Web search not supported by this model'
          }
          disabled={!supportsSearch}
          whileHover={supportsSearch ? springHover : undefined}
          whileTap={supportsSearch ? springTap : undefined}
        >
          <Globe size={13} aria-hidden="true" />
          <span className={styles.searchLabel}>Search</span>
          <AnimatePresence>
            {webSearchEnabled && supportsSearch && (
              <motion.span
                className={styles.searchDot}
                aria-hidden="true"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* Dynamic Island — morphing status pill */}
        <DynamicIsland />

        <div className={styles.spacer} />

        <span className={styles.divider} />

        {!isMobile && (
          <>
            <motion.button
              className={styles.headerAction}
              type="button"
              aria-label="Toggle parallel compare"
              data-active={comparisonMode}
              onClick={handleToggleComparison}
              title="Parallel inference"
              whileHover={springHover}
              whileTap={springTap}
            >
              <Columns2 size={16} aria-hidden="true" />
            </motion.button>
            <motion.button
              className={styles.headerAction}
              type="button"
              aria-label="Toggle canvas"
              data-active={canvasOpen}
              onClick={toggleCanvas}
              whileHover={springHover}
              whileTap={springTap}
            >
              <PanelRight size={16} aria-hidden="true" />
            </motion.button>
          </>
        )}
        <motion.button
          className={styles.headerAction}
          type="button"
          aria-label="Toggle parameters"
          onClick={() => setParamDrawerOpen(!paramDrawerOpen)}
          whileHover={springHover}
          whileTap={springTap}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </motion.button>
        {!isMobile && (
          <motion.button
            className={styles.headerAction}
            type="button"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
            whileHover={springHover}
            whileTap={springTap}
          >
            <Settings size={16} aria-hidden="true" />
          </motion.button>
        )}
      </motion.header>
      <ModelSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
