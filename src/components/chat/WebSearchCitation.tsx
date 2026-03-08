/**
 * WebSearchCitation
 * 
 * Renders a web search result as an inline citation card.
 * Shows source, title, snippet, and a link to the original URL.
 */

import { ExternalLink, Globe } from 'lucide-react';
import type { WebSearchResult } from '../../types/messages';
import styles from './WebSearchCitation.module.css';

interface WebSearchCitationProps {
  result: WebSearchResult;
  index: number;
}

export function WebSearchCitation({ result, index }: WebSearchCitationProps): JSX.Element {
  const domain = (() => {
    try { return new URL(result.url).hostname.replace('www.', ''); }
    catch { return result.source; }
  })();

  return (
    <a
      className={styles.citation}
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Citation ${index + 1}: ${result.title}`}
    >
      <div className={styles.indexBadge} aria-hidden="true">{index + 1}</div>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{result.title}</span>
          <ExternalLink size={12} className={styles.externalIcon} aria-hidden="true" />
        </div>
        <div className={styles.sourceRow}>
          <Globe size={10} aria-hidden="true" />
          <span className={styles.domain}>{domain}</span>
        </div>
        {result.snippet && (
          <p className={styles.snippet}>{result.snippet}</p>
        )}
      </div>
    </a>
  );
}

/** Renders a list of citations grouped together */
interface WebSearchCitationsProps {
  results: WebSearchResult[];
}

export function WebSearchCitations({ results }: WebSearchCitationsProps): JSX.Element | null {
  if (results.length === 0) return null;

  return (
    <div className={styles.citationList} role="list" aria-label="Search citations">
      <div className={styles.citationHeader}>
        <span className={styles.citationHeaderIcon}>
          <Globe size={11} aria-hidden="true" />
        </span>
        <span>Sources ({results.length})</span>
      </div>
      {results.map((result, i) => (
        <WebSearchCitation key={result.url + i} result={result} index={i} />
      ))}
    </div>
  );
}
