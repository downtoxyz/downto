import { Tables } from '@/app/types/database.types';

export type InterestCheck = Tables<'interest_checks'> & {
  author: Tables<'profiles'>;
  responses: CheckResponse[];
  squads: CheckSquad[];
  co_authors: (Tables<'check_co_authors'> & {
    user: Tables<'profiles'>;
  })[];
};

const RESPONSE = ['down', 'maybe'] as const;
export type ResponseType = (typeof RESPONSE)[number];

export type CheckResponse = Tables<'check_responses'> & {
  response: ResponseType;
  user: Tables<'profiles'>;
};

export type CheckSquad = Pick<Tables<'squads'>, 'id' | 'archived_at'> & {
  members: Pick<Tables<'squad_members'>, 'id' | 'role'>[];
};
