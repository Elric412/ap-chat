/**
 * useRovingFocus
 * 
 * Keyboard navigation for lists/grids using arrow keys.
 * Implements WAI-ARIA roving tabindex pattern.
 */

import { useCallback, useRef, useState, useEffect } from 'react';

interface UseRovingFocusOptions {
  itemCount: number;
  orientation?: 'horizontal' | 'vertical' | 'both';
  wrap?: boolean;
  onSelect?: (index: number) => void;
}

export function useRovingFocus({
  itemCount,
  orientation = 'vertical',
  wrap = true,
  onSelect,
}: UseRovingFocusOptions) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // Reset active index if item count changes
  useEffect(() => {
    if (activeIndex >= itemCount) {
      setActiveIndex(Math.max(0, itemCount - 1));
    }
  }, [itemCount, activeIndex]);

  const focusItem = useCallback((index: number) => {
    const el = itemRefs.current[index];
    if (el) {
      el.focus();
      setActiveIndex(index);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (itemCount === 0) return;

    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

    let newIndex = activeIndex;

    switch (e.key) {
      case prevKey:
      case (orientation === 'both' ? 'ArrowUp' : undefined):
      case (orientation === 'both' ? 'ArrowLeft' : undefined):
        e.preventDefault();
        if (activeIndex > 0) {
          newIndex = activeIndex - 1;
        } else if (wrap) {
          newIndex = itemCount - 1;
        }
        break;

      case nextKey:
      case (orientation === 'both' ? 'ArrowDown' : undefined):
      case (orientation === 'both' ? 'ArrowRight' : undefined):
        e.preventDefault();
        if (activeIndex < itemCount - 1) {
          newIndex = activeIndex + 1;
        } else if (wrap) {
          newIndex = 0;
        }
        break;

      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;

      case 'End':
        e.preventDefault();
        newIndex = itemCount - 1;
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect?.(activeIndex);
        return;

      default:
        return;
    }

    if (newIndex !== activeIndex) {
      focusItem(newIndex);
    }
  }, [activeIndex, itemCount, orientation, wrap, onSelect, focusItem]);

  const getItemProps = useCallback((index: number) => ({
    ref: (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    },
    tabIndex: index === activeIndex ? 0 : -1,
    onFocus: () => setActiveIndex(index),
    'data-roving-active': index === activeIndex,
  }), [activeIndex]);

  return {
    activeIndex,
    setActiveIndex,
    handleKeyDown,
    getItemProps,
    focusItem,
  };
}
