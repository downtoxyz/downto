import cn from '@/lib/tailwindMerge';
import Badge from './Badge';

interface IconButtonProps {
  badge?: boolean;
  badgeCount?: number;
  icon: React.ReactNode | string;
  type: 'stroke' | 'fill';
  onClick: () => void;
}

export default function IconButton({
  badge = false,
  badgeCount,
  icon,
  type,
  onClick,
}: IconButtonProps) {
  const typeVariants = {
    stroke: 'fill-none bg-transparent stroke-neutral-500 stroke-2',
    fill: 'bg-dt text-neutral-950 font-bold',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 text-2xl',
        typeVariants[type]
      )}
    >
      {icon}
      {badge && <Badge count={badgeCount} />}
    </button>
  );
}
