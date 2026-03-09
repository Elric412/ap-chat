/**
 * SkillUsageBadge — Shows which skills were applied to a message
 */

import { useAppStore } from '../../store';
import styles from './SkillUsageBadge.module.css';

interface SkillUsageBadgeProps {
  skillIds: string[];
}

export function SkillUsageBadge({ skillIds }: SkillUsageBadgeProps): JSX.Element | null {
  const skills = useAppStore((s) => s.skills);
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen);

  if (skillIds.length === 0) return null;

  const appliedSkills = skillIds
    .map((id) => skills.find((s) => s.id === id))
    .filter(Boolean);

  if (appliedSkills.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {appliedSkills.map((skill) => (
        <button
          key={skill!.id}
          className={styles.badge}
          onClick={() => setSkillPanelOpen(true)}
          type="button"
          title={`Skill: ${skill!.name}`}
        >
          <span className={styles.badgeIcon}>{skill!.icon}</span>
          {skill!.name}
        </button>
      ))}
    </div>
  );
}
