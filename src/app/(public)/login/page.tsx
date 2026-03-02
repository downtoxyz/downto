"use client";

import Form from "next/form";
import { useEffect, useActionState, useState } from "react";
import FormInput from "@/components/ui/Form/FormInput";
import Button from "@/components/ui/Button/Button";
import { sendOtp } from "@/lib/auth";
import ErrorText from "@/components/ui/ErrorText/ErrorText";

import styles from "./page.module.css";

export default function LoginPage() {
  const [pendingAddUser, setPendingAddUser] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, sendCodeAction, pending] = useActionState(sendOtp, null);

  useEffect(() => {
    const stored = localStorage.getItem("pendingAddUsername");
    if (stored) setPendingAddUser(stored);
  }, []);

  return (
    <div>
      {pendingAddUser && (
        <div className={styles.messageContainer}>
          <p>log in or create a profile to add @{pendingAddUser}</p>
        </div>
      )}

      {error && (
        <div className={styles.errorContainer}>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      <Form action={sendCodeAction} autoComplete="off">
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
          disabled={!email.includes("@") || pending}
          size="large"
          fullWidth
        >
          {pending ? "Sending..." : "Send Code"}
        </Button>
      </Form>
    </div>
  );
}
