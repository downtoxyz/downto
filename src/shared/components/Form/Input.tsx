import cn from '@/lib/tailwindMerge';
import React, {
  DetailedHTMLProps,
  forwardRef,
  InputHTMLAttributes,
} from 'react';

export type InputType =
  | 'text'
  | 'email'
  | 'date'
  | 'time'
  | 'datetime'
  | 'number'
  | 'hidden';

export type InputProps = {
  name: string;
  type?: InputType;
  placeholder?: string;
  className?: string;
} & DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;

const Input: React.FC<InputProps> = forwardRef<HTMLInputElement, InputProps>(
  ({ id, name, type = 'text', placeholder, className, ...rest }, ref) => {
    return (
      <input
        ref={ref}
        name={name}
        type={type}
        placeholder={placeholder}
        className={cn(
          'focus:border-dt mb-4 rounded-xl border border-solid border-neutral-800 bg-neutral-900 p-4 font-mono text-lg text-white outline-0 placeholder:text-neutral-700',
          className
        )}
        {...rest}
      ></input>
    );
  }
);

export default Input;
