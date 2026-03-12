import cn from '@/lib/tailwindMerge';
import React from 'react';

export default function BottomSheetModal({
  children,
  onClose,
  header,
}: {
  children: React.ReactNode;
  onClose: () => void;
  header?: React.ReactElement;
}) {
  return (
    <div className="fixed inset-0 z-50 flex h-dvh items-end pb-[env(safe-area-inset-bottom)]">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="animate-slide-up relative mx-auto max-h-[85dvh] w-full max-w-105 overflow-y-scroll rounded-tl-3xl rounded-tr-3xl bg-neutral-900 px-6 pb-6">
        <div
          className={cn(
            'sticky top-0 bg-linear-to-b from-neutral-900 from-95% pt-5',
            {
              'pb-3': !header,
              'pb-5': header,
            }
          )}
        >
          <div className="mx-auto h-1 w-10 rounded-xs bg-neutral-700" />
          {header && <div className="pt-2">{header}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
