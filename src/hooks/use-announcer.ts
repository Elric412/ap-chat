/**
 * useAnnouncer
 * 
 * Screen reader announcements via ARIA live regions.
 * Call announce() to notify assistive technologies.
 */

import { useCallback } from 'react';

type Politeness = 'polite' | 'assertive';

let announcerElement: HTMLElement | null = null;

function getAnnouncerElement(): HTMLElement {
  if (announcerElement) return announcerElement;

  announcerElement = document.createElement('div');
  announcerElement.setAttribute('aria-live', 'polite');
  announcerElement.setAttribute('aria-atomic', 'true');
  announcerElement.setAttribute('role', 'status');
  announcerElement.id = 'a11y-announcer';
  
  // Visually hidden but accessible
  Object.assign(announcerElement.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });

  document.body.appendChild(announcerElement);
  return announcerElement;
}

export function announce(message: string, politeness: Politeness = 'polite'): void {
  const el = getAnnouncerElement();
  el.setAttribute('aria-live', politeness);
  
  // Clear then set to trigger announcement
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}

export function useAnnouncer() {
  const announcePolite = useCallback((message: string) => {
    announce(message, 'polite');
  }, []);

  const announceAssertive = useCallback((message: string) => {
    announce(message, 'assertive');
  }, []);

  return {
    announce: announcePolite,
    announceAssertive,
  };
}
