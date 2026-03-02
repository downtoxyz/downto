import styles from "./FormInput.module.css";
import Input, { InputProps, InputType } from "./Input";

type FormInputProps = {
  name: string;
  label?: string;
  error?: string;
  inputClassName?: string;
} & Omit<InputProps, "name">;

export default function FormInput({
  name,
  label,
  error,
  inputClassName,
  ...rest
}: FormInputProps) {
  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={name} className={styles.label}>
          {label}
          {rest.required && "*"}
        </label>
      )}
      <Input name={name} className={inputClassName} {...rest} />
      {error && <p>{error}</p>}
    </div>
  );
}
