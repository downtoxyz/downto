'use client';

// import { Notification, NotificationTypes } from '@/app/types/ui-types';
import cn from '@/lib/tailwindMerge';
import { formatTimeAgo } from '@/lib/utils';
import { Notification, NotificationTypes } from '../types';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const notificationTypeMap = {
  [NotificationTypes.CHECK_RESPONSE]: { icon: '🔥', color: 'bg-dt/13' },
  [NotificationTypes.CHECK_TAG]: { icon: '🏷️', color: 'bg-dt/13' },
  [NotificationTypes.DATE_CONFIRM]: { icon: '📅', color: 'bg-dt/13' },
  [NotificationTypes.FRIEND_ACCEPTED]: { icon: '🤝', color: 'bg-dt/13' },
  [NotificationTypes.FRIEND_CHECK]: { icon: '💬', color: 'bg-indigo-600/13' },
  [NotificationTypes.FRIEND_REQUEST]: { icon: '👋', color: 'bg-dt/13' },
  [NotificationTypes.SQUAD_INVITE]: { icon: '🚀', color: 'bg-dt/13' },
  [NotificationTypes.SQUAD_MESSAGE]: { icon: '💬', color: 'bg-indigo-600/13' },
};

export default function NotificationItem({
  notification,
  closeModal,
}: {
  notification: Notification;
  closeModal: () => void;
}) {
  const router = useRouter();

  const getRedirectUrl = () => {
    switch (notification.type) {
      case NotificationTypes.CHECK_RESPONSE:
      case NotificationTypes.CHECK_TAG:
      case NotificationTypes.DATE_CONFIRM:
        return '/feed';
      case NotificationTypes.FRIEND_ACCEPTED:
      case NotificationTypes.FRIEND_CHECK:
      case NotificationTypes.FRIEND_REQUEST:
      case NotificationTypes.SQUAD_INVITE:
      case NotificationTypes.SQUAD_MESSAGE:
        return '/groups';
      default:
        return '/feed';
    }
  };

  return (
    <Link
      key={notification.id}
      className="flex cursor-pointer gap-3 py-3.5"
      href={getRedirectUrl()}
      onNavigate={closeModal}
    >
      <div
        className={cn(
          'flex h-9 min-w-9 flex-0 items-center justify-center rounded-full text-base',
          notificationTypeMap[notification.type].color
        )}
      >
        {notificationTypeMap[notification.type].icon}
      </div>
      <div className="flex flex-1 flex-col">
        <span className="mb-0.5 text-xs">{notification.title}</span>
        <span className="text-tiny">{notification.body}</span>
        {notification.created_at && (
          <span className="text-tiny">
            {formatTimeAgo(new Date(notification.created_at))}
          </span>
        )}
      </div>
    </Link>
  );
}
