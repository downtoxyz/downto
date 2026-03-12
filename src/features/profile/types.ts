import { Tables } from '@/app/types/database.types';

export enum Availability {
  OPEN = 'open',
  AWKWARD = 'awkward',
  NOT_AVAILABLE = 'not-available',
}
export type AvailabilityType = (typeof Availability)[keyof typeof Availability];

export const AvailabilityMap = {
  [Availability.OPEN]: {
    emoji: '✨',
    label: 'open to friends!',
  },
  [Availability.AWKWARD]: {
    emoji: '👀',
    label: 'available, but awkward',
  },
  [Availability.NOT_AVAILABLE]: {
    emoji: '🌙',
    label: 'not available rn',
  },
};

export type Profile = Tables<'profiles'> & {
  availability: AvailabilityType | null;
};
