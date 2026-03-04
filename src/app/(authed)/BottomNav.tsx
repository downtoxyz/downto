'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

import cn from '@/lib/tailwindMerge';

const enum Tab {
  FEED = 'feed',
  CALENDAR = 'calendar',
  GROUPS = 'groups',
  PROFILE = 'profile',
}

type TabData = { icon: string; label: string };

const tabMap: Record<Tab, TabData> = {
  [Tab.FEED]: {
    icon: '⚡',
    label: 'Feed',
  },
  [Tab.CALENDAR]: {
    icon: '📅',
    label: 'Cal',
  },
  [Tab.GROUPS]: {
    icon: '👥',
    label: 'Squads',
  },
  [Tab.PROFILE]: {
    icon: '⚙',
    label: 'You',
  },
};

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <footer className="sticky bottom-0 bg-linear-to-t from-neutral-950 from-70% px-4 py-5">
      <nav className="bg-neutral-925 flex justify-around rounded-[1.125rem] border border-neutral-900 py-3">
        {Object.entries(tabMap).map(([tab, data]) => (
          <Link
            className={cn(
              {
                'text-dt font-bold': pathname === `/${tab}`,
                'text-neutral-500': pathname !== `/${tab}`,
              },
              'text-tiny relative px-4 py-2 tracking-[0.12em] uppercase'
            )}
            href={`/${tab}`}
            key={tab}
          >
            <span className="align-center">
              {data.icon} {data.label}
            </span>
          </Link>
        ))}
      </nav>
    </footer>
  );
}
