/**
 * SkillCard — Individual skill display within the panel
 */

import { useCallback } from 'react';
import { Edit3, Copy, Trash2, Check } from 'lucide-react';
import { useAppStore } from '../../store';
import type { Skill, SkillLibraryMode } from '../../types/skills';
import styles from './SkillCard.module.css';

interface SkillCardProps {
  skill: Skill;
  mode: SkillLibraryMode;
  isCustomSelected: boolean;
}

export function SkillCard({ skill, mode, isCustomSelected }: SkillCardProps): JSX.Element {
  const toggleSkillEnabled = useAppStore((s) => s.toggleSkillEnabled);
  const toggleSkillCustomSelection = useAppStore((s) => s.toggleSkillCustomSelection);
  const setSkillEditorOpen = useAppStore((s) => s.setSkillEditorOpen);
  const duplicateSkill = useAppStore((s) => s.duplicateSkill);
  const deleteSkill = useAppStore((s) => s.deleteSkill);

  const handleToggle = useCallback(() => {
    if (mode === 'custom') {
      toggleSkillCustomSelection(skill.id);
    } else {
      toggleSkillEnabled(skill.id);
    }
  }, [mode, skill.id, toggleSkillEnabled, toggleSkillCustomSelection]);

  const isEffectivelySelected = mode === 'custom' ? isCustomSelected : skill.enabled;

  return (
    <div
      className={styles.card}
      data-disabled={!skill.enabled && mode !== 'custom'}
      data-selected={mode === 'custom' && isCustomSelected}
    >
      <div className={styles.icon}>{skill.icon}</div>

      <div className={styles.body}>
        <div className={styles.nameRow}>
          <span className={styles.name}>{skill.name}</span>
          {skill.isBuiltin && <span className={styles.builtinBadge}>Built-in</span>}
        </div>
        <div className={styles.description}>{skill.description}</div>
        {skill.tags.length > 0 && (
          <div className={styles.tags}>
            {skill.tags.slice(0, 5).map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button
          className={styles.actionBtn}
          onClick={() => setSkillEditorOpen(true, skill.id)}
          type="button"
          aria-label="Edit skill"
        >
          <Edit3 size={13} />
        </button>
        <button
          className={styles.actionBtn}
          onClick={() => duplicateSkill(skill.id)}
          type="button"
          aria-label="Duplicate skill"
        >
          <Copy size={13} />
        </button>
        {!skill.isBuiltin && (
          <button
            className={styles.actionBtn}
            data-destructive="true"
            onClick={() => deleteSkill(skill.id)}
            type="button"
            aria-label="Delete skill"
          >
            <Trash2 size={13} />
          </button>
        )}

        {/* Toggle or Checkbox */}
        {mode === 'custom' ? (
          <button
            className={styles.checkbox}
            data-checked={isCustomSelected}
            onClick={handleToggle}
            type="button"
            aria-label={isCustomSelected ? 'Deselect skill' : 'Select skill'}
          >
            {isCustomSelected && <Check size={10} />}
          </button>
        ) : (
          <button
            className={styles.toggle}
            data-on={skill.enabled}
            onClick={handleToggle}
            type="button"
            aria-label={skill.enabled ? 'Disable skill' : 'Enable skill'}
          />
        )}
      </div>
    </div>
  );
}
