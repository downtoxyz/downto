'use client';

import { startTransition, useActionState, useState } from 'react';

import BottomSheetModal from '@/shared/components/BottomSheetModal';
import { createInterestCheck } from '@/features/checks/services/interest-checks';
import Button from '@/shared/components/Button';
import TextArea from '@/shared/components/Form/TextArea';
import cn from '@/lib/tailwindMerge';

const CheckExpiryOptions = {
  ONE: 1,
  FOUR: 4,
  HALFDAY: 12,
  FULLDAY: 24,
  OPEN: 'open',
} as const;
export type CheckExpiryType =
  (typeof CheckExpiryOptions)[keyof typeof CheckExpiryOptions];

const SquadSizeOptions = {
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  EIGHT: 8,
  OPEN: 'open',
} as const;
export type SquadSizeType =
  (typeof SquadSizeOptions)[keyof typeof SquadSizeOptions];

const Option = ({
  isSelected,
  onClick,
  label,
}: {
  isSelected: boolean;
  onClick: () => void;
  label: string;
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex-1 cursor-pointer rounded-lg border border-solid py-2.5 text-center text-xs transition-all',
        {
          'border-dt bg-dt font-bold text-neutral-950': isSelected,
          'border-neutral-800 bg-transparent font-normal': !isSelected,
        }
      )}
    >
      <span className="align-middle">{label}</span>
    </div>
  );
};

export default function AddCheckModal({
  closeModal,
}: {
  closeModal: () => void;
}) {
  const [text, setText] = useState('');
  const [expiry, setExpiry] = useState<CheckExpiryType>(
    CheckExpiryOptions.HALFDAY
  );
  const [squadSize, setSquadSize] = useState<SquadSizeType>(
    SquadSizeOptions.FIVE
  );
  const [error, createInterestCheckAction, pending] = useActionState(
    createInterestCheck,
    null
  );

  const handleSendCheck = () => {
    startTransition(() => {
      createInterestCheckAction({ text, expiry, squadSize });
    });
  };

  return (
    <BottomSheetModal onClose={closeModal}>
      <div className="flex flex-col gap-4">
        <p className="text-xs">Got an idea? See if your friends are down.</p>
        <TextArea
          name="text"
          placeholder="e.g., park hang w me and @kat ^.^ dinner at 7 tomorrow? need to touch grass asap"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />

        <div>
          <legend className="text-tiny mb-2 tracking-widest text-neutral-500 uppercase">
            Expires in
          </legend>
          <div className="flex gap-2">
            {Object.values(CheckExpiryOptions).map((option) => (
              <Option
                key={`expiry-${option}`}
                onClick={() => setExpiry(option)}
                isSelected={option === expiry}
                label={
                  option === CheckExpiryOptions.OPEN ? '∞' : option.toString()
                }
              />
            ))}
          </div>
        </div>

        <div>
          <legend className="text-tiny mb-2 tracking-widest text-neutral-500 uppercase">
            Squad Size
          </legend>
          <div className="flex gap-2">
            {Object.values(SquadSizeOptions).map((option) => (
              <Option
                key={`squad-${option}`}
                onClick={() => setSquadSize(option)}
                isSelected={option === squadSize}
                label={
                  option === SquadSizeOptions.OPEN ? '∞' : option.toString()
                }
              />
            ))}
          </div>
        </div>

        <Button
          size="large"
          variant="primary"
          disabled={!text || pending}
          fullWidth
          onClick={handleSendCheck}
        >
          {pending ? 'Sending...' : 'Send Interest Check →'}
        </Button>

        {error && <div>{error}</div>}
      </div>
    </BottomSheetModal>
  );
}
