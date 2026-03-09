/**
 * SkillLibraryPanel — Main skill management drawer
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store';
import { SkillCard } from './SkillCard';
import { SkillEditor } from './SkillEditor';
import type { SkillCategory, SkillLibraryMode } from '../../types/skills';
import styles from './SkillLibraryPanel.module.css';

const MODE_LABELS: Record<SkillLibraryMode, string> = {
  disabled: 'Disabled',
  all: 'All Skills',
  custom: 'Custom',
};

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  data: 'Data & Analytics',
  devops: 'DevOps',
  design: 'Design',
  writing: 'Writing',
  analysis: 'Analysis',
  security: 'Security',
  mobile: 'Mobile',
  general: 'General',
};

export function SkillLibraryPanel(): JSX.Element | null {
  const open = useAppStore((s) => s.skillPanelOpen);
  const setOpen = useAppStore((s) => s.setSkillPanelOpen);
  const skillConfig = useAppStore((s) => s.skillConfig);
  const setSkillMode = useAppStore((s) => s.setSkillMode);
  const setSkillStrategy = useAppStore((s) => s.setSkillStrategy);
  const skills = useAppStore((s) => s.skills);
  const setSkillEditorOpen = useAppStore((s) => s.setSkillEditorOpen);
  const skillEditorOpen = useAppStore((s) => s.skillEditorOpen);
  const getSkillTokenEstimate = useAppStore((s) => s.getSkillTokenEstimate);

  const [search, setSearch] = useState('');

  const filteredSkills = useMemo(() => {
    if (!search.trim()) return skills;
    const q = search.toLowerCase();
    return skills.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q)) ||
      s.category.includes(q)
    );
  }, [skills, search]);

  const grouped = useMemo(() => {
    const map = new Map<SkillCategory, typeof filteredSkills>();
    for (const skill of filteredSkills) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return map;
  }, [filteredSkills]);

  const enabledCount = skills.filter((s) => s.enabled).length;
  const tokenEst = skillConfig.mode !== 'disabled' ? getSkillTokenEstimate() : 0;

  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  if (!open) return null;

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className={styles.backdrop} onClick={handleClose} aria-hidden="true" />
          <motion.div
            className={styles.panel}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Skill Library"
          >
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerTop}>
                <h2 className={styles.title}>Skill Library</h2>
                <button className={styles.closeBtn} onClick={handleClose} type="button" aria-label="Close">
                  <X size={16} />
                </button>
              </div>

              {/* Mode toggle */}
              <div className={styles.modeToggle}>
                {(Object.keys(MODE_LABELS) as SkillLibraryMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={styles.modeBtn}
                    data-active={skillConfig.mode === mode}
                    onClick={() => setSkillMode(mode)}
                    type="button"
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>

              {/* Strategy note */}
              <div className={styles.strategyNote}>
                <Zap size={12} />
                <span>
                  {skillConfig.strategy === 'single_pass' ? 'Single-pass' : 'Two-pass'} strategy
                </span>
                <button
                  className={styles.strategyToggle}
                  onClick={() => setSkillStrategy(skillConfig.strategy === 'single_pass' ? 'two_pass' : 'single_pass')}
                  type="button"
                >
                  Switch
                </button>
                {tokenEst > 0 && (
                  <span style={{ marginLeft: 'auto' }}>~{tokenEst.toLocaleString()} tokens</span>
                )}
              </div>
            </div>

            {/* Search */}
            <div className={styles.searchRow}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search skills…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search skills"
              />
            </div>

            {/* Skill list */}
            <div
              className={styles.skillList}
              data-disabled={skillConfig.mode === 'disabled' ? true : undefined}
            >
              <div className={skillConfig.mode === 'disabled' ? styles.disabledOverlay : undefined}>
                {grouped.size === 0 && (
                  <div className={styles.emptyState}>
                    {search ? 'No matching skills' : 'No skills available'}
                  </div>
                )}
                {Array.from(grouped.entries()).map(([category, categorySkills]) => (
                  <div key={category} className={styles.categoryGroup}>
                    <div className={styles.categoryHeader}>{CATEGORY_LABELS[category]}</div>
                    {categorySkills.map((skill) => (
                      <SkillCard
                        key={skill.id}
                        skill={skill}
                        mode={skillConfig.mode}
                        isCustomSelected={skillConfig.customSelection.includes(skill.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <span className={styles.footerStats}>
                {skills.length} skills · {enabledCount} enabled
              </span>
              <button
                className={styles.createBtn}
                onClick={() => setSkillEditorOpen(true, null)}
                type="button"
              >
                <Plus size={14} />
                New Skill
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Editor modal */}
      {skillEditorOpen && <SkillEditor />}
    </>,
    document.body
  );
}
