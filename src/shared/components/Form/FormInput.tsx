import Input, { InputProps } from './Input';

type FormInputProps = {
  name: string;
  label?: string;
  error?: string;
  inputClassName?: string;
} & Omit<InputProps, 'name'>;

export default function FormInput({
  name,
  label,
  error,
  inputClassName,
  ...rest
}: FormInputProps) {
  return (
    <div className="flex flex-col">
      {label && (
        <label
          htmlFor={name}
          className="text-tiny mb-2 tracking-[0.15em] uppercase"
        >
          {label}
          {rest.required && '*'}
        </label>
      )}
      <Input name={name} className={inputClassName} {...rest} />
      {error && <p>{error}</p>}
    </div>
  );
}
