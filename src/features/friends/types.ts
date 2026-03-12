import { Tables } from '@/app/types/database.types';
import { AvailabilityType } from '../profile/types';

export type Friend = {
  profile: Tables<'profiles'> & {
    availability: AvailabilityType | null;
  };
  friendshipId: string;
};
