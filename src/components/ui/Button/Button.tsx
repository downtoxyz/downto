"use client";

import React from "react";
import clsx from "clsx";

import styles from "./Button.module.css";

interface ButtonProps {
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "outline" | "highlight";
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  onClick,
  variant = "primary",
  type = "button",
  size = "small",
  children,
  disabled = false,
  fullWidth = false,
}) => {
  return (
    <button
      type={type}
      className={clsx(styles.button, styles[variant], styles[size], {
        [styles.disabled]: disabled,
        [styles.fullWidth]: fullWidth,
      })}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

export default Button;
