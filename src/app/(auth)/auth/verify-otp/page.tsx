'use client';

import Form from 'next/form';
import { startTransition, Suspense, useActionState, useState } from 'react';

import Link from 'next/link';
import { redirect, useSearchParams } from 'next/navigation';

import { verifyOtp, resendOtp } from '@/features/auth/services/auth';
import Button from '@/shared/components/Button';
import FormInput from '@/shared/components/Form/FormInput';

function VerifyOtp() {
  const [verifyError, verifyAction, verifyPending] = useActionState(
    verifyOtp,
    null
  );
  const [resendError, resendAction] = useActionState(resendOtp, null);
  const [otp, setOtp] = useState('');

  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  if (!email) {
    redirect('/login');
  }

  const handleResend = (formData: FormData) => {
    // Immediately reset form state
    setOtp('');

    startTransition(async () => {
      await resendAction(formData);
    });
  };

  return (
    <div className="flex flex-col">
      {verifyError && (
        <div className="mb-5">
          <p className="text-danger text-xs">{verifyError}</p>
        </div>
      )}

      {resendError && (
        <div className="mb-5">
          <p className="text-danger text-xs">{resendError}</p>
        </div>
      )}

      <div className="mb-5 text-xs">
        <p>
          We sent a code to
          <br />
          <span className="text-dt">{email}</span>
        </p>
      </div>

      <Form action={verifyAction}>
        <FormInput type="hidden" name="email" value={email} />
        <FormInput
          label="Code"
          name="code"
          inputMode="numeric"
          onChange={(e) =>
            setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))
          }
          value={otp}
          placeholder="00000000"
          autoFocus
          autoComplete="one-time-code"
          inputClassName="text-2xl text-center tracking-[0.3rem]"
        />
        <Button
          type="submit"
          size="large"
          disabled={!otp || verifyPending}
          fullWidth
        >
          {verifyPending ? 'Verifying...' : 'Verify'}
        </Button>
        <div className="mt-3 flex justify-center gap-4 font-mono text-xs text-neutral-700">
          <Link href="/login" className="underline">
            Different email
          </Link>
          <button
            className="cursor-pointer border-0 bg-transparent underline"
            formAction={handleResend}
          >
            Resend code
          </button>
        </div>
      </Form>
    </div>
  );
}

/**
 * Page handles OTP entry, verification, and resend
 */
export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VerifyOtp />
    </Suspense>
  );
}
