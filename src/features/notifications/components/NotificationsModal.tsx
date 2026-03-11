import BottomSheetModal from '@/shared/components/BottomSheetModal';
import NotificationItem from './NotificationItem';
import { Notification } from '../types';

export default function NotificationsModal({
  notifications,
  closeModal,
}: {
  notifications: Notification[];
  closeModal: () => void;
}) {
  return (
    <BottomSheetModal
      onClose={closeModal}
      header={<h2 className="font-serif text-xl text-white">Notifications</h2>}
    >
      {notifications.map((n) => (
        <NotificationItem notification={n} closeModal={closeModal} key={n.id} />
      ))}
    </BottomSheetModal>
  );
}
