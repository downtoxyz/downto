import { format, formatDistanceToNow, isPast } from 'date-fns';

export function formatExpiresAt(expiresAt: string | null) {
  if (!expiresAt) {
    return 'open';
  }

  const d = new Date(expiresAt);
  if (isPast(d)) {
    return 'expired';
  }

  return formatDistanceToNow(d);
}

export function formatEventDateTime({
  eventDate,
  eventTime,
}: {
  eventDate: string | null;
  eventTime: string | null;
}) {
  if (!eventDate && !eventTime) {
    return 'date & time TBD';
  }

  return (
    (eventDate ? format(new Date(eventDate), 'eee, MMM d') : 'date TBD') +
    ' at ' +
    (eventTime ? eventTime : 'time TBD')
  );
}

export function getExpiryPercent({
  expiresAt,
  createdAt,
}: {
  expiresAt: string | null;
  createdAt: string | null;
}): number {
  if (!expiresAt || !createdAt) {
    return 0;
  }

  const now = new Date();
  const created = new Date(createdAt);
  const expires = new Date(expiresAt);

  const duration = expires.getTime() - created.getTime();
  const remaining = expires.getTime() - now.getTime();

  return 100 - Math.min(100, Math.floor((remaining / duration) * 100));
}
