"use client";

import React from "react";

import styles from "./LinkButton.module.css";

interface LinkButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
}

const LinkButton: React.FC<LinkButtonProps> = ({ onClick, children }) => {
  return (
    <button className={styles.linkButton} onClick={onClick}>
      {children}
    </button>
  );
};

export default LinkButton;
