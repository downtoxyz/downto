'use client';

import cn from '@/lib/tailwindMerge';
import { startTransition, useOptimistic, useState } from 'react';
import { updateProfile } from '@/features/profile/services/profiles';
import { Availability, AvailabilityMap, AvailabilityType } from '../types';

const cardColorVariants = {
  open: 'border-dt bg-dt/15 text-dt',
  awkward: 'border-orange-300 bg-orange-300/15 text-orange-300',
  'not-available': 'border-neutral-500 bg-neutral-500/15 text-neutral-500',
};

export default function ProfileAvailability({
  availability: initialAvailability,
}: {
  availability: AvailabilityType;
}) {
  const [availability, setAvailability] = useState(initialAvailability);
  const [optimisticAvailability, setOptimisticAvailability] =
    useOptimistic(availability);

  const updateAvailability = (availability: AvailabilityType) => {
    startTransition(async () => {
      try {
        setOptimisticAvailability(availability);
        await updateProfile({ availability });
        setAvailability(availability);
      } catch {}
    });
  };

  return (
    <div className="flex w-full flex-col">
      <h3 className="text-tiny mb-3.5 tracking-widest text-neutral-700 uppercase">
        right now
      </h3>
      <div className="flex w-full flex-col gap-2">
        {Object.values(Availability).map((option) => (
          <button
            key={option}
            className={cn(
              'justify-content flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-solid px-3.5 py-3 text-xs',
              {
                [cardColorVariants[option]]: optimisticAvailability === option,
                'font-bold': optimisticAvailability === option,
                'border-neutral-800 font-normal text-neutral-500':
                  optimisticAvailability !== option,
              }
            )}
            onClick={() => updateAvailability(option)}
          >
            <span style={{ fontSize: 18 }}>
              {AvailabilityMap[option].emoji}
            </span>
            <p className="flex-1 text-left">{AvailabilityMap[option].label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
