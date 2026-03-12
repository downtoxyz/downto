'use client';

import Form from 'next/form';
import { useEffect, useActionState, useState } from 'react';
import FormInput from '@/shared/components/Form/FormInput';
import Button from '@/shared/components/Button';
import { sendOtp } from '@/features/auth/services/auth';

export default function LoginPage() {
  const [pendingAddUser, setPendingAddUser] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, sendCodeAction, pending] = useActionState(sendOtp, null);

  useEffect(() => {
    const stored = localStorage.getItem('pendingAddUsername');
    if (stored) setPendingAddUser(stored);
  }, []);

  return (
    <div>
      {pendingAddUser && (
        <div className="mb-4">
          <p className="text-dt">
            log in or create a profile to add @{pendingAddUser}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <p className="text-red-500">{error}</p>
        </div>
      )}
      <Form
        action={sendCodeAction}
        autoComplete="off"
        className="flex flex-col gap-4"
      >
        <FormInput
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
        <Button
          type="submit"
          disabled={!email.includes('@') || pending}
          size="large"
          fullWidth
        >
          {pending ? 'Sending...' : 'Send Code'}
        </Button>
      </Form>
    </div>
  );
}
