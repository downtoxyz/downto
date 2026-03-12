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
  getDistanceToExpire,
} from '../utils';
import { useEffect, useState } from 'react';

export default function CheckCard({
  check: {
    responses,
    id,
    author_id: authorId,
    text,
    created_at: createdAt,
    expires_at: expiresAt,
    author,
    event_date: eventDate,
    event_time: eventTime,
  },
}: {
  check: InterestCheck;
}) {
  const { user } = useAuth();
  const [distanceToExpire, setDistanceToExpire] = useState(
    getDistanceToExpire(expiresAt)
  );
  const totalDistance = createdAt
    ? getDistanceToExpire(expiresAt, createdAt)
    : 0;
  const expiryPercent =
    totalDistance > 0
      ? Math.floor((distanceToExpire / totalDistance) * 100)
      : 0;

  useEffect(() => {
    const intervalId = setInterval(() => {
      setDistanceToExpire((prev) => {
        if (prev == 0) {
          clearInterval(intervalId);
          return 0;
        } else {
          return getDistanceToExpire(expiresAt);
        }
      });
    }, 60000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const isAuthor = authorId == user.id;
  const currentUserResponse =
    responses.find((r) => r.user_id === user.id)?.response ?? null;

  return (
    <div
      className={cn('overflow-hidden rounded-xl border border-solid', {
        'bg-neutral-925 border-neutral-900': !isAuthor,
        'bg-dt/5 border-dt/20': isAuthor,
      })}
    >
      {expiryPercent > 0 && (
        <div className="relative top-0 h-0.75 bg-neutral-900">
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
          <p className="flex-1 font-serif text-lg leading-[1.4] wrap-break-word text-white">
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
        <div id={`check-${id}:responses-root`}></div>
      </div>
    </div>
  );
}
