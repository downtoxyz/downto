"use client";

import Button from "@/components/ui/Button/Button";
import FormInput from "@/components/ui/Form/FormInput";
import { verifyOtp } from "@/lib/auth";
import Form from "next/form";
import { startTransition, use, useActionState, useState } from "react";

import Link from "next/link";
import LinkButton from "@/components/ui/LinkButton/LinkButton";
import { resendOtp } from "@/lib/auth";

import styles from "./page.module.css";
import ErrorText from "@/components/ui/ErrorText/ErrorText";

export default function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [verifyError, verifyAction, verifyPending] = useActionState(
    verifyOtp,
    null,
  );
  const [resendError, resendAction] = useActionState(resendOtp, null);
  const [otp, setOtp] = useState("");

  const email = use(searchParams).email as string;

  const handleResend = () => {
    // Immediately reset form state
    setOtp("");

    startTransition(async () => {
      await resendAction(email);
    });
  };

  if (email) {
    return (
      <div className={styles.wrapper}>
        {verifyError && (
          <div className={styles.errorContainer}>
            <ErrorText>{verifyError}</ErrorText>
          </div>
        )}

        {resendError && (
          <div className={styles.errorContainer}>
            <ErrorText>{resendError}</ErrorText>
          </div>
        )}

        <div className={styles.messageContainer}>
          <p>
            We sent a code to
            <br />
            <span className={styles.highlight}>{email}</span>
          </p>
        </div>

        <Form action={verifyAction}>
          <FormInput type="hidden" name="email" value={email} />
          <FormInput
            label="Code"
            name="code"
            inputMode="numeric"
            onChange={(e) =>
              setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))
            }
            value={otp}
            placeholder="00000000"
            autoFocus
            autoComplete="one-time-code"
            required
            inputClassName={styles.codeInput}
          />
          <Button
            type="submit"
            size="large"
            disabled={otp.length !== 8 || verifyPending}
            fullWidth
          >
            {verifyPending ? "Verifying..." : "Verify"}
          </Button>
        </Form>
        <div className={styles.linkContainer}>
          <Link href="/login" className={styles.navLink}>Different email</Link>
          <LinkButton onClick={handleResend}>Resend code</LinkButton>
        </div>
      </div>
    );
  }
}
