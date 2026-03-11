'use client';

import AddCheckModal from '@/features/checks/components/AddCheckModal';
import IconButton from '@/shared/components/IconButton';
import { useModal } from '../../providers/ModalProvider';
import NotificationsModal from '@/features/notifications/components/NotificationsModal';
import { Notification } from '@/features/notifications/types';

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
  unreadCount,
  notifications,
}: {
  unreadCount: number;
  notifications: Notification[];
}) {
  const { openModal, closeModal } = useModal();

  const openNotificationsModal = () => {
    openModal(
      <NotificationsModal
        notifications={notifications}
        closeModal={closeModal}
      />
    );
  };

  const openAddCheckModal = () => {
    openModal(<AddCheckModal closeModal={closeModal} />);
  };

  return (
    <div className="flex items-center gap-2.5">
      <IconButton
        type="stroke"
        badge={!!unreadCount}
        badgeCount={unreadCount}
        onClick={openNotificationsModal}
        icon={BellSvgIcon}
      />
      <IconButton type="fill" onClick={openAddCheckModal} icon="+" />
    </div>
  );
}
