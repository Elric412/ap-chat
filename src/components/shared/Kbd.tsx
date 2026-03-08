import styles from './Kbd.module.css';

interface KbdProps {
  children: string;
}

export function Kbd({ children }: KbdProps): JSX.Element {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
