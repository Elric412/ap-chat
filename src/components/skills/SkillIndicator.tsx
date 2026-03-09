/**
 * SkillIndicator — Compact skill status button for ChatInput action bar
 */

import { BookOpen } from 'lucide-react';
import { useAppStore } from '../../store';
import styles from './SkillIndicator.module.css';

export function SkillIndicator(): JSX.Element {
  const skillConfig = useAppStore((s) => s.skillConfig);
  const getAvailableSkills = useAppStore((s) => s.getAvailableSkills);
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen);

  const available = getAvailableSkills();
  const isActive = skillConfig.mode !== 'disabled';

  return (
    <button
      className={styles.indicator}
      data-active={isActive}
      data-disabled={!isActive}
      onClick={() => setSkillPanelOpen(true)}
      type="button"
      aria-label={isActive ? `${available.length} skills active` : 'Skills disabled'}
      title={isActive ? `${available.length} skills active` : 'Skill Library (disabled)'}
    >
      <BookOpen size={14} />
      {isActive && available.length > 0 && (
        <span className={styles.count}>{available.length}</span>
      )}
    </button>
  );
}
