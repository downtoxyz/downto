'use client';

import cn from '@/lib/tailwindMerge';
import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'outline' | 'highlight';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  type = 'button',
  size = 'small',
  children,
  disabled,
  fullWidth = false,
  className,
  ...props
}) => {
  const variants = {
    primary: 'bg-(--color-dt)',
    outline:
      'text-neutral-500 font-normal transparent border border-solid border-neutral-700',
    highlight: 'text-dt bg-transparent border border-solid border-dt',
  };

  const sizeVariants = {
    small: 'text-tiny rounded-lg py-[0.4rem] px-[0.625rem]',
    medium: 'text-xs rounded-lg p-2.5',
    large: 'text-sm rounded-xl p-4 uppercase tracking-widest',
  };

  return (
    <button
      type={type}
      className={cn(
        'cursor-pointer border-0 font-(family-name:--font-space-mono) text-xs font-bold text-neutral-700',
        sizeVariants[size],
        variants[variant],
        {
          'cursor-not-allowed bg-neutral-800 text-neutral-500': disabled,
          'w-full': fullWidth,
        },
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
