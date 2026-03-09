import cn from '@/lib/tailwindMerge';

interface DownToLogoProps {
  size?: 'small' | 'display';
}

export default function DownToLogo({ size = 'small' }: DownToLogoProps) {
  const sizeVariants = {
    small: 'text-3xl',
    display: 'text-5xl',
  };

  return (
    <p
      className={cn(
        'font-(family-name:--font-instrument-serif) text-white',
        sizeVariants[size]
      )}
    >
      down to
    </p>
  );
}
