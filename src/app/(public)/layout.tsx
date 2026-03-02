import DownToLogo from "@/components/ui/DownToLogo/DownToLogo";

import styles from './layout.module.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <div className={styles.displaySection}>
        <DownToLogo size="display" />
        <p className={styles.displaySubheading}>from idea to squad in 10 seconds</p>
      </div>
      {children}
    </main>
  );
}
