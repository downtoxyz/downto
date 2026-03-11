import Button from '@/shared/components/Button';
import { startTransition, useOptimistic, useState } from 'react';
import {
  removeCheckResponse,
  updateCheckResponse,
} from '@/features/checks/services/check-responses';
import cn from '@/lib/tailwindMerge';
import { useAuth } from '@/app/providers/AuthProvider';
import { ResponseType } from '../types';

export default function CheckActions({
  checkId,
  response: initialResponse,
}: {
  checkId: string;
  response: ResponseType | null;
}) {
  const { user } = useAuth();
  const [response, setResponse] = useState(initialResponse);
  const [optimisticResponse, setOptimisticResponse] = useOptimistic(response);

  const handleCheckResponse = (res: ResponseType) => {
    const updatedResponse = res === response ? null : res;
    if (user) {
      startTransition(async () => {
        setOptimisticResponse(updatedResponse);

        if (updatedResponse) {
          await updateCheckResponse({
            userId: user.id,
            checkId,
            response: updatedResponse,
          });
        } else {
          await removeCheckResponse({
            userId: user.id,
            checkId,
          });
        }

        setResponse(updatedResponse);
      });
    }
  };

  return (
    <div className="flex gap-1.5">
      <Button
        size="small"
        variant={optimisticResponse === 'down' ? 'primary' : 'outline'}
        onClick={() => handleCheckResponse('down')}
        className={cn({
          "text-bold before:mr-1 before:content-['✓']":
            optimisticResponse === 'down',
        })}
      >
        Down
      </Button>
      <Button
        size="small"
        variant={optimisticResponse === 'maybe' ? 'primary' : 'outline'}
        onClick={() => handleCheckResponse('maybe')}
        className={cn({
          "bg-neutral-500 font-normal text-neutral-950 before:mr-1 before:content-['✓']":
            optimisticResponse === 'maybe',
        })}
      >
        Maybe
      </Button>
    </div>
  );
}
