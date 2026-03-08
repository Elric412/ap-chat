/**
 * WebSearchCitation
 * 
 * Renders web search results as rich citation cards with favicons,
 * expandable snippets, and smooth animations.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Globe, ChevronDown, Search } from 'lucide-react';
import type { WebSearchResult } from '../../types/messages';
import styles from './WebSearchCitation.module.css';

interface WebSearchCitationProps {
  result: WebSearchResult;
  index: number;
}

export function WebSearchCitation({ result, index }: WebSearchCitationProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const domain = (() => {
    try { return new URL(result.url).hostname.replace('www.', ''); }
    catch { return result.source; }
  })();

  const faviconUrl = (() => {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}&sz=32`; }
    catch { return null; }
  })();

  return (
    <motion.div
      className={styles.citation}
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <a
        className={styles.citationLink}
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Citation ${index + 1}: ${result.title}`}
      >
        <div className={styles.indexBadge} aria-hidden="true">{index + 1}</div>
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{result.title || domain}</span>
            <ExternalLink size={12} className={styles.externalIcon} aria-hidden="true" />
          </div>
          <div className={styles.sourceRow}>
            {faviconUrl ? (
              <img
                src={faviconUrl}
                alt=""
                className={styles.favicon}
                width={12}
                height={12}
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <Globe size={10} aria-hidden="true" />
            )}
            <span className={styles.domain}>{domain}</span>
            {result.fetchedAt && (
              <span className={styles.fetchedAt}>
                {new Date(result.fetchedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </a>
      {result.snippet && (
        <button
          className={styles.expandBtn}
          onClick={() => setExpanded(!expanded)}
          type="button"
          aria-label={expanded ? 'Collapse snippet' : 'Expand snippet'}
        >
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={12} />
          </motion.span>
        </button>
      )}
      <AnimatePresence>
        {expanded && result.snippet && (
          <motion.p
            className={styles.snippet}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {result.snippet}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** Renders a list of citations grouped together */
interface WebSearchCitationsProps {
  results: WebSearchResult[];
}

export function WebSearchCitations({ results }: WebSearchCitationsProps): JSX.Element | null {
  if (results.length === 0) return null;

  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      className={styles.citationList}
      role="list"
      aria-label="Search citations"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <button
        className={styles.citationHeader}
        onClick={() => setCollapsed(!collapsed)}
        type="button"
      >
        <span className={styles.citationHeaderIcon}>
          <Search size={11} aria-hidden="true" />
        </span>
        <span>Sources ({results.length})</span>
        <motion.span
          className={styles.collapseIcon}
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={12} />
        </motion.span>
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className={styles.citationItems}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {results.map((result, i) => (
              <WebSearchCitation key={result.url + i} result={result} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
