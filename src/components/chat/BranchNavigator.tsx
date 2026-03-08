import { useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import styles from './BranchNavigator.module.css';

interface BranchNavigatorProps {
  parentId: string;
  currentIndex: number;
  totalSiblings: number;
}

export function BranchNavigator({
  parentId,
  currentIndex,
  totalSiblings,
}: BranchNavigatorProps): JSX.Element {
  const switchBranch = useAppStore((s) => s.switchBranch);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      switchBranch(parentId, currentIndex - 1);
    }
  }, [parentId, currentIndex, switchBranch]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalSiblings - 1) {
      switchBranch(parentId, currentIndex + 1);
    }
  }, [parentId, currentIndex, totalSiblings, switchBranch]);

  return (
    <div className={styles.branchNavigator} role="navigation" aria-label="Branch navigation">
      <button
        className={styles.navButton}
        onClick={handlePrev}
        disabled={currentIndex === 0}
        type="button"
        aria-label="Previous branch"
      >
        <ChevronLeft size={12} aria-hidden="true" />
      </button>
      <span className={styles.counter}>
        {currentIndex + 1}/{totalSiblings}
      </span>
      <button
        className={styles.navButton}
        onClick={handleNext}
        disabled={currentIndex === totalSiblings - 1}
        type="button"
        aria-label="Next branch"
      >
        <ChevronRight size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
