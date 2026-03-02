import React from "react";

import styles from './ErrorText.module.css'

export default function ErrorText({ children }: { children: React.ReactNode }) {
    return (
        <p className={styles.errorText}>{children}</p>
    )
}