import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Settings, SlidersHorizontal, PanelRight, Columns2, Globe, Menu, Cloud, CloudOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { PROVIDER_META } from '../../constants/provider-meta';
import { ModelSelector } from '../models/ModelSelector';
import { Tooltip } from '../shared/Tooltip';
import { useMediaQuery } from '../../hooks/use-media-query';
import styles from './Header.module.css';

type Ease4 = [number, number, number, number];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];

const buttonTap = { scale: 0.88, transition: { duration: 0.08 } };
const buttonHover = { y: -1, transition: { duration: 0.15, ease: EASE_SNAP } };

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
  const autoSaveStatus = useAppStore((s) => s.autoSaveStatus);
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
              transition={{ duration: 0.2, ease: EASE_SNAP }}
              whileTap={buttonTap}
            >
              <Menu size={20} aria-hidden="true" />
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
          transition={{ duration: 0.15, ease: EASE_SNAP }}
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
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
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
          whileHover={supportsSearch ? buttonHover : undefined}
          whileTap={supportsSearch ? buttonTap : undefined}
        >
          <Globe size={14} aria-hidden="true" />
          <span className={styles.searchLabel}>Search</span>
          <AnimatePresence>
            {webSearchEnabled && supportsSearch && (
              <motion.span
                className={styles.searchDot}
                aria-hidden="true"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
              />
            )}
          </AnimatePresence>
        </motion.button>

        {/* Auto-save indicator */}
        <AnimatePresence mode="wait">
          {autoSaveStatus !== 'idle' && (
            <motion.span
              key={autoSaveStatus}
              className={styles.saveStatus}
              data-status={autoSaveStatus}
              title={`Auto-save: ${autoSaveStatus}`}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              {autoSaveStatus === 'saving' ? (
                <Cloud size={12} className={styles.savePulse} aria-hidden="true" />
              ) : autoSaveStatus === 'saved' ? (
                <Cloud size={12} aria-hidden="true" />
              ) : autoSaveStatus === 'error' ? (
                <CloudOff size={12} aria-hidden="true" />
              ) : null}
              {!isMobile && autoSaveStatus === 'saved' && <span className={styles.saveLabel}>Saved</span>}
            </motion.span>
          )}
        </AnimatePresence>

        <div className={styles.spacer} />

        {!isMobile && (
          <>
            <motion.button
              className={styles.headerAction}
              type="button"
              aria-label="Toggle parallel compare"
              data-active={comparisonMode}
              onClick={handleToggleComparison}
              title="Parallel inference"
              whileHover={buttonHover}
              whileTap={buttonTap}
            >
              <Columns2 size={18} aria-hidden="true" />
            </motion.button>
            <motion.button
              className={styles.headerAction}
              type="button"
              aria-label="Toggle canvas"
              data-active={canvasOpen}
              onClick={toggleCanvas}
              whileHover={buttonHover}
              whileTap={buttonTap}
            >
              <PanelRight size={18} aria-hidden="true" />
            </motion.button>
          </>
        )}
        <motion.button
          className={styles.headerAction}
          type="button"
          aria-label="Toggle parameters"
          onClick={() => setParamDrawerOpen(!paramDrawerOpen)}
          whileHover={buttonHover}
          whileTap={buttonTap}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
        </motion.button>
        {!isMobile && (
          <motion.button
            className={styles.headerAction}
            type="button"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
            whileHover={buttonHover}
            whileTap={buttonTap}
          >
            <Settings size={18} aria-hidden="true" />
          </motion.button>
        )}
      </motion.header>
      <ModelSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
    </>
  );
}
