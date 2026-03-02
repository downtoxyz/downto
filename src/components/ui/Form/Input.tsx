import clsx from "clsx";
import React, {
  DetailedHTMLProps,
  forwardRef,
  InputHTMLAttributes,
} from "react";

import styles from "./Input.module.css";

export type InputType =
  | "text"
  | "email"
  | "date"
  | "time"
  | "datetime"
  | "number"
  | "hidden";

export type InputProps = {
  name: string;
  type?: InputType;
  placeholder?: string;
  className?: string;
} & DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;

const Input: React.FC<InputProps> = forwardRef<HTMLInputElement, InputProps>(
  ({ id, name, type = "text", placeholder, className, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        name={name}
        type={type}
        placeholder={placeholder}
        className={clsx(styles.input, className)}
        {...rest}
      ></input>
    );
  },
);

export default Input;
