'use client';

import cn from '@/lib/tailwindMerge';
import AvatarLetter from '@/shared/components/AvatarLetter';
import CheckResponses from './CheckResponses';
import { InterestCheck } from '../types';
import { useAuth } from '@/app/providers/AuthProvider';
import CheckActions from './CheckActions';
import {
  formatEventDateTime,
  formatExpiresAt,
  getExpiryPercent,
} from '../utils';

export default function CheckCard({ check }: { check: InterestCheck }) {
  const { user } = useAuth();

  const {
    responses,
    id,
    author_id: authorId,
    text,
    created_at: createdAt,
    expires_at: expiresAt,
    author,
    event_date: eventDate,
    event_time: eventTime,
  } = check;

  const isAuthor = authorId == user.id;
  const currentUserResponse =
    responses.find((r) => r.user_id === user.id)?.response ?? null;

  const expiryPercent = getExpiryPercent({ expiresAt, createdAt });

  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-solid', {
        'bg-neutral-925 border-neutral-900': !isAuthor,
        'bg-dt/5 border-dt/20': isAuthor,
      })}
      id={`check-${id}`}
    >
      {expiryPercent > 0 && (
        <div className="relative h-0.75 bg-neutral-900">
          <div
            className={cn('absolute top-0 left-0 h-full', {
              'bg-green-400': 50 <= expiryPercent && expiryPercent < 100,
              'bg-orange-300': 25 <= expiryPercent && expiryPercent < 50,
              'bg-danger': expiryPercent < 25,
            })}
            style={{ width: `${expiryPercent}%` }}
          ></div>
        </div>
      )}

      <div className="p-3.5">
        <div className="mb-2.5 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AvatarLetter
              avatarLetter={author.avatar_letter}
              highlight={isAuthor}
            />
            <span
              className={cn('text-tiny', {
                'text-dt': isAuthor,
                'text-neutral-500': !isAuthor,
              })}
            >
              {author.display_name}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-tiny">{formatExpiresAt(expiresAt)}</span>
          </div>
        </div>
        <div className="mb-3 flex-col items-start gap-1.5">
          <p className="flex-1 font-serif text-lg leading-[1.4] text-white">
            {text}
          </p>
          <p className="pt-2 text-xs text-neutral-500">
            {formatEventDateTime({
              eventDate,
              eventTime,
            })}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <CheckResponses checkId={id} responses={responses} />
          {!isAuthor && (
            <CheckActions checkId={id} response={currentUserResponse} />
          )}
        </div>
      </div>
    </div>
  );
}
