'use client';

import IconButton from '../../../components/ui/IconButton';
import { useState } from 'react';
import AddCheckModal from './AddCheckModal';
import NotificationsModal from './NotificationsModal';

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

export default function HeaderActions({
  notificationCount,
}: {
  notificationCount: number;
}) {
  const [isAddCheckModalOpen, setIsAddCheckModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] =
    useState(false);

  return (
    <div className="flex items-center gap-2.5">
      <IconButton
        type="stroke"
        badge={!!notificationCount}
        badgeCount={notificationCount}
        onClick={() => setIsNotificationsModalOpen(true)}
        icon={BellSvgIcon}
      />
      <IconButton
        type="fill"
        onClick={() => setIsAddCheckModalOpen(true)}
        icon="+"
      />

      {/* {isNotificationsModalOpen && (
        <NotificationsModal
          closeModal={() => setIsNotificationsModalOpen(false)}
        />
      )}
      {isAddCheckModalOpen && (
        <AddCheckModal closeModal={() => setIsAddCheckModalOpen(false)} />
      )} */}
    </div>
  );
}
