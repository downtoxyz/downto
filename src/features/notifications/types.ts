import { Tables } from '@/app/types/database.types';

export type Notification = Tables<'notifications'> & {
  type: NotificationType;
  related_user: Tables<'profiles'> | null;
};

export const NotificationTypes = {
  CHECK_RESPONSE: 'check_response',
  CHECK_TAG: 'check_tag',
  DATE_CONFIRM: 'date_confirm',
  FRIEND_ACCEPTED: 'friend_accepted,',
  FRIEND_CHECK: 'friend_check',
  FRIEND_REQUEST: 'friend_request',
  SQUAD_INVITE: 'squad_invite',
  SQUAD_MESSAGE: 'squad_message',
} as const;
export type NotificationType =
  (typeof NotificationTypes)[keyof typeof NotificationTypes];
