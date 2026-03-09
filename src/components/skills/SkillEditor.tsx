/**
 * SkillEditor — Create/edit skill modal
 */

import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store';
import type { SkillCategory } from '../../types/skills';
import styles from './SkillEditor.module.css';

const CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'data', label: 'Data & Analytics' },
  { value: 'devops', label: 'DevOps' },
  { value: 'design', label: 'Design' },
  { value: 'writing', label: 'Writing' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'security', label: 'Security' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'general', label: 'General' },
];

export function SkillEditor(): JSX.Element {
  const editingSkillId = useAppStore((s) => s.editingSkillId);
  const skills = useAppStore((s) => s.skills);
  const setSkillEditorOpen = useAppStore((s) => s.setSkillEditorOpen);
  const createSkill = useAppStore((s) => s.createSkill);
  const updateSkill = useAppStore((s) => s.updateSkill);
  const resetBuiltinSkill = useAppStore((s) => s.resetBuiltinSkill);

  const existingSkill = editingSkillId ? skills.find((s) => s.id === editingSkillId) : null;
  const isEditing = !!existingSkill;

  const [icon, setIcon] = useState(existingSkill?.icon ?? '🧠');
  const [name, setName] = useState(existingSkill?.name ?? '');
  const [instructions, setInstructions] = useState(existingSkill?.instructions ?? '');
  const [category, setCategory] = useState<SkillCategory>(existingSkill?.category ?? 'general');
  const [tagsStr, setTagsStr] = useState(existingSkill?.tags.join(', ') ?? '');

  const tokenEstimate = useMemo(() => Math.ceil(instructions.length / 4), [instructions]);
  const canSave = name.trim().length > 0 && instructions.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const tags = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);

    if (isEditing && editingSkillId) {
      updateSkill(editingSkillId, { icon, name: name.trim(), description: description.trim(), instructions: instructions.trim(), category, tags });
    } else {
      createSkill({ icon, name: name.trim(), description: description.trim(), instructions: instructions.trim(), category, tags, enabled: true });
    }
    setSkillEditorOpen(false);
  };

  const handleClose = () => setSkillEditorOpen(false);

  return createPortal(
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className={styles.backdrop} onClick={(e) => { e.stopPropagation(); handleClose(); }} onMouseDown={(e) => e.stopPropagation()} aria-hidden="true" />
      <motion.div
        className={styles.editor}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-label={isEditing ? 'Edit Skill' : 'Create Skill'}
      >
        <div className={styles.editorHeader}>
          <h3 className={styles.editorTitle}>{isEditing ? 'Edit Skill' : 'New Skill'}</h3>
          <button className={styles.closeBtn} onClick={handleClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className={styles.editorBody}>
          {/* Icon + Name */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Name & Icon</label>
            <div className={styles.fieldRow}>
              <input
                className={styles.iconInput}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={2}
                aria-label="Skill icon"
              />
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Skill name"
                maxLength={60}
                aria-label="Skill name"
              />
            </div>
          </div>

          {/* Description */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Description</label>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One to two sentences explaining what this skill covers. The LLM reads this to decide relevance."
              maxLength={300}
              rows={2}
              aria-label="Skill description"
            />
          </div>

          {/* Category + Tags */}
          <div className={styles.field}>
            <div className={styles.fieldRow}>
              <div>
                <label className={styles.fieldLabel}>Category</label>
                <select
                  className={styles.select}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SkillCategory)}
                  aria-label="Skill category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.fieldLabel}>Tags</label>
                <input
                  className={styles.input}
                  value={tagsStr}
                  onChange={(e) => setTagsStr(e.target.value)}
                  placeholder="react, css, api"
                  aria-label="Skill tags"
                />
                <div className={styles.tagsHint}>Comma-separated keywords</div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Instructions</label>
            <textarea
              className={styles.instructionsArea}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Expert-level instructions for the LLM. Be specific and actionable."
              aria-label="Skill instructions"
            />
            <div className={styles.tokenHint}>~{tokenEstimate.toLocaleString()} tokens</div>
          </div>
        </div>

        <div className={styles.editorFooter}>
          {isEditing && existingSkill?.isBuiltin && (
            <button
              className={styles.resetBtn}
              onClick={() => { resetBuiltinSkill(existingSkill.id); handleClose(); }}
              type="button"
            >
              Reset to default
            </button>
          )}
          <button className={styles.cancelBtn} onClick={handleClose} type="button">Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!canSave} type="button">
            {isEditing ? 'Save Changes' : 'Create Skill'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
