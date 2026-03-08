import clsx from 'clsx';

interface BadgeProps {
  count?: number;
}

export default function Badge({ count }: BadgeProps) {
  return (
    <div
      className={clsx(
        'absolute top-1 right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white',
        {
          'h-4 w-4': !!count,
          'w-4.25': !!count && count > 9,
        }
      )}
    >
      {!!count && count > 99 ? '99+' : count}
    </div>
  );
}
