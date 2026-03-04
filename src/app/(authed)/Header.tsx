'use client';

import DownToLogo from '../../components/ui/DownToLogo';
import IconButton from '../../components/ui/IconButton';

const BellSvgIcon = (
  <svg
    className="stroke-linecap-round h-5.5 w-5.5"
    viewBox="0 0 24 24"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between bg-linear-to-b from-neutral-950 from-80% px-4 pt-5 pb-4">
      <DownToLogo />
      <div className="flex items-center gap-2.5">
        <IconButton
          type="stroke"
          badge
          badgeCount={15}
          onClick={() => {}}
          icon={BellSvgIcon}
        />
        <IconButton type="fill" onClick={() => {}} icon="+" />
      </div>
    </header>
  );
}
