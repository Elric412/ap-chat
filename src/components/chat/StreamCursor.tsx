/**
 * StreamCursor
 * 
 * Pulsing cursor shown at the end of a streaming assistant message.
 */

import styles from './StreamCursor.module.css';

interface StreamCursorProps {
  visible: boolean;
}

export function StreamCursor({ visible }: StreamCursorProps): JSX.Element {
  return (
    <span
      className={visible ? styles.cursor : styles.cursorHidden}
      aria-hidden="true"
    />
  );
}
