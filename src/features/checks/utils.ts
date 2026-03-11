import { InterestCheck } from './types';

// Convert expires_at into human-readable format (ex: 'open', '3h', 'expired')
export function formatInterestCheckExpiresAt(
  expiresAt: InterestCheck['expires_at']
) {
  if (!expiresAt) {
    return 'open';
  }

  const now = new Date();
  const expires = new Date(expiresAt);
  const msRemaining = expires.getTime() - now.getTime();
  const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
  const minsRemaining = Math.floor(
    (msRemaining % (1000 * 60 * 60)) / (1000 * 60)
  );

  if (hoursRemaining) {
    return `${hoursRemaining}h`;
  }

  if (minsRemaining) {
    return `${minsRemaining}m`;
  }

  return 'expired';
}
