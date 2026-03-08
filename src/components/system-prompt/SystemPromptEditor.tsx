/**
 * SystemPromptEditor
 * 
 * Full system prompt management UI with:
 * - Global vs per-conversation scope toggle
 * - Textarea editor with char count
 * - Template library with category filters
 * - Custom template CRUD
 */

import { useState, useCallback, useMemo } from 'react';
import { Terminal, Plus, Trash2, Check } from 'lucide-react';
import { useAppStore } from '../../store';
import type { SystemPromptTemplate } from '../../types/system-prompts';
import styles from './SystemPromptEditor.module.css';

const CATEGORIES = ['all', 'general', 'coding', 'writing', 'analysis', 'roleplay', 'custom'] as const;
type CategoryFilter = typeof CATEGORIES[number];

interface SystemPromptEditorProps {
  conversationId?: string | null;
}

export function SystemPromptEditor({ conversationId }: SystemPromptEditorProps): JSX.Element {
  const config = useAppStore((s) => s.systemPromptConfig);
  const setGlobal = useAppStore((s) => s.setGlobalSystemPrompt);
  const setConvPrompt = useAppStore((s) => s.setConversationSystemPrompt);
  const clearConvPrompt = useAppStore((s) => s.clearConversationSystemPrompt);
  const getAllTemplates = useAppStore((s) => s.getAllTemplates);
  const addTemplate = useAppStore((s) => s.addTemplate);
  const deleteTemplate = useAppStore((s) => s.deleteTemplate);
  const addToast = useAppStore((s) => s.addToast);

  const [scope, setScope] = useState<'global' | 'conversation'>(
    conversationId ? 'conversation' : 'global'
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<SystemPromptTemplate['category']>('custom');

  const currentPrompt = scope === 'global'
    ? config.globalPrompt
    : (conversationId ? config.conversationPrompts[conversationId] ?? '' : '');

  const handleChange = useCallback((value: string) => {
    if (scope === 'global') {
      setGlobal(value);
    } else if (conversationId) {
      if (value.trim()) {
        setConvPrompt(conversationId, value);
      } else {
        clearConvPrompt(conversationId);
      }
    }
  }, [scope, conversationId, setGlobal, setConvPrompt, clearConvPrompt]);

  const handleApplyTemplate = useCallback((template: SystemPromptTemplate) => {
    handleChange(template.content);
    addToast({ type: 'info', title: `Template "${template.name}" applied`, dismissible: true, duration: 3000 });
  }, [handleChange, addToast]);

  const handleCreateTemplate = useCallback(() => {
    if (!newName.trim() || !newContent.trim()) return;
    addTemplate(newName.trim(), newContent.trim(), newDesc.trim(), newCategory);
    setShowNewForm(false);
    setNewName('');
    setNewContent('');
    setNewDesc('');
    addToast({ type: 'success', title: 'Template created', dismissible: true });
  }, [newName, newContent, newDesc, newCategory, addTemplate, addToast]);

  const handleSaveAsTemplate = useCallback(() => {
    if (!currentPrompt.trim()) return;
    addTemplate('Custom Prompt', currentPrompt.trim(), 'Saved from editor', 'custom');
    addToast({ type: 'success', title: 'Saved as template', dismissible: true });
  }, [currentPrompt, addTemplate, addToast]);

  const templates = useMemo(() => {
    const all = getAllTemplates();
    if (categoryFilter === 'all') return all;
    return all.filter((t) => t.category === categoryFilter);
  }, [getAllTemplates, categoryFilter]);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Terminal size={16} className={styles.headerIcon} aria-hidden="true" />
          <h2 className={styles.title}>System Prompt</h2>
          {conversationId && scope === 'conversation' && (
            <span className={styles.badge}>Per-chat</span>
          )}
        </div>
        {conversationId && (
          <div className={styles.scopeToggle}>
            <button
              className={styles.scopeBtn}
              data-active={scope === 'global'}
              onClick={() => setScope('global')}
              type="button"
            >
              Global
            </button>
            <button
              className={styles.scopeBtn}
              data-active={scope === 'conversation'}
              onClick={() => setScope('conversation')}
              type="button"
            >
              This Chat
            </button>
          </div>
        )}
      </div>

      {/* Editor */}
      <textarea
        className={styles.promptTextarea}
        value={currentPrompt}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={scope === 'global'
          ? 'Set a default system prompt for all conversations…'
          : 'Set a custom system prompt for this conversation…'
        }
        aria-label="System prompt"
      />

      <div className={styles.promptFooter}>
        <span className={styles.charCount}>
          {currentPrompt.length > 0 ? `${currentPrompt.length} chars · ~${Math.ceil(currentPrompt.length / 4)} tokens` : ''}
        </span>
        <div className={styles.actionRow}>
          {currentPrompt.trim() && (
            <>
              <button className={styles.clearBtn} onClick={() => handleChange('')} type="button">
                Clear
              </button>
              <button className={styles.clearBtn} onClick={handleSaveAsTemplate} type="button">
                Save as Template
              </button>
            </>
          )}
        </div>
      </div>

      {/* Template Library */}
      <div className={styles.templateSection}>
        <div className={styles.templateHeader}>
          <span className={styles.templateTitle}>Template Library</span>
          <button
            className={styles.addTemplateBtn}
            onClick={() => setShowNewForm(!showNewForm)}
            type="button"
          >
            <Plus size={12} aria-hidden="true" />
            New
          </button>
        </div>

        {/* Category filters */}
        <div className={styles.categoryFilters}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={styles.categoryBtn}
              data-active={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
              type="button"
            >
              {cat}
            </button>
          ))}
        </div>

        {/* New template form */}
        {showNewForm && (
          <div className={styles.newTemplateForm}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Name</label>
              <input
                className={styles.formInput}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Template name"
                maxLength={100}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Content</label>
              <textarea
                className={styles.formTextarea}
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="System prompt content…"
                maxLength={10000}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Description</label>
              <input
                className={styles.formInput}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description"
                maxLength={200}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Category</label>
              <select
                className={styles.formSelect}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as SystemPromptTemplate['category'])}
              >
                <option value="general">General</option>
                <option value="coding">Coding</option>
                <option value="writing">Writing</option>
                <option value="analysis">Analysis</option>
                <option value="roleplay">Roleplay</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className={styles.formActions}>
              <button className={styles.clearBtn} onClick={() => setShowNewForm(false)} type="button">Cancel</button>
              <button
                className={styles.saveBtn}
                onClick={handleCreateTemplate}
                disabled={!newName.trim() || !newContent.trim()}
                type="button"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {/* Template list */}
        <div className={styles.templateGrid}>
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              className={styles.templateCard}
              data-active={currentPrompt === tmpl.content}
              onClick={() => handleApplyTemplate(tmpl)}
              type="button"
            >
              <div className={styles.templateCardHeader}>
                <span className={styles.templateName}>{tmpl.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <span className={styles.templateCategory}>{tmpl.category}</span>
                  {currentPrompt === tmpl.content && (
                    <Check size={14} style={{ color: 'var(--color-success-text)' }} />
                  )}
                  {!tmpl.isBuiltin && (
                    <span
                      className={styles.templateActionBtn}
                      data-variant="danger"
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(tmpl.id); }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Delete ${tmpl.name}`}
                    >
                      <Trash2 size={12} />
                    </span>
                  )}
                </div>
              </div>
              <span className={styles.templateDesc}>{tmpl.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
