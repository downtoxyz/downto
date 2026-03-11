import cn from '@/lib/tailwindMerge';

export default function AvatarLetter({
  avatarLetter,
  size = 'small',
  highlight = false,
  className,
}: {
  avatarLetter: string | null;
  size?: 'inline' | 'small' | 'medium' | 'display';
  highlight?: boolean;
  className?: string;
}) {
  const sizeVariants = {
    inline: 'w-6 h-6 text-tiny',
    small: 'w-7 h-7 text-xs',
    medium: 'w-10 h-10 text-lg',
    display: 'w-18 h-18 text-2xl',
  };

  return (
    <div
      className={cn(
        'mx-auto flex items-center justify-center rounded-full font-bold',
        sizeVariants[size],
        {
          'bg-dt text-neutral-950': highlight,
          'bg-neutral-800 text-neutral-500': !highlight,
        },
        className
      )}
    >
      {avatarLetter ?? '?'}
    </div>
  );
}
