"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { color } from "@/lib/styles";
import Grain from "@/app/components/Grain";

const AuthScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [pendingAddUser, setPendingAddUser] = useState<string | null>(null);
  const [pendingCheck, setPendingCheck] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("pendingAddUsername");
    if (stored) setPendingAddUser(stored);
    if (
      localStorage.getItem("pendingCheckId") ||
      new URLSearchParams(window.location.search).has("pendingCheck")
    ) {
      setPendingCheck(true);
    }
  }, []);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (!email.includes("@")) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setStep("otp");
    }
  };

  const handleVerifyCode = async () => {
    if (otp.length !== 8) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      onLogin();
    }
  };

  return (
    <div className="flex flex-col" style={{ padding: "60px 24px" }}>
      <Grain />

      <h1 className="font-serif text-5xl text-primary font-normal mb-2">
        down to
      </h1>
      <p
        className="font-mono text-sm text-dim"
        style={{ marginBottom: pendingAddUser ? 12 : 48 }}
      >
        from idea to squad in 10 seconds
      </p>
      {pendingCheck && !pendingAddUser && (
        <div
          className="rounded-xl mb-8"
          style={{
            background: "rgba(232,255,90,0.08)",
            border: `1px solid rgba(232,255,90,0.2)`,
            padding: "12px 16px",
          }}
        >
          <p className="font-mono text-xs text-dt m-0 leading-normal">
            sign up or log in to respond to this check
          </p>
          <p className="font-mono text-tiny text-dim" style={{ margin: "4px 0 0" }}>
            quick setup, then you&apos;re in
          </p>
        </div>
      )}
      {pendingAddUser && (
        <p className="font-mono text-xs text-dt mb-9">
          log in or create a profile to add @{pendingAddUser}
        </p>
      )}

      {error && (
        <p className="font-mono text-xs text-danger mb-4">
          {error}
        </p>
      )}

      {step === "email" ? (
        <>
          <label
            className="font-mono text-tiny uppercase text-dim mb-2"
            style={{ letterSpacing: "0.15em" }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            placeholder="you@email.com"
            className="bg-card border border-border-mid rounded-xl p-4 text-primary font-mono text-lg outline-none mb-4"
          />
          <button
            onClick={handleSendCode}
            disabled={!email.includes("@") || loading}
            className="border-none rounded-xl p-4 font-mono text-sm font-bold uppercase"
            style={{
              background: email.includes("@") ? color.accent : color.borderMid,
              color: email.includes("@") ? "#000" : color.dim,
              cursor: email.includes("@") ? "pointer" : "not-allowed",
              letterSpacing: "0.1em",
            }}
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </>
      ) : (
        <>
          <p className="font-mono text-xs text-dim mb-5">
            We sent a code to<br />
            <span className="text-dt">{email}</span>
          </p>
          <label
            className="font-mono text-tiny uppercase text-dim mb-2"
            style={{ letterSpacing: "0.15em" }}
          >
            Code
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
            placeholder="00000000"
            autoFocus
            className="bg-card border border-border-mid rounded-xl p-4 text-primary font-mono text-2xl text-center outline-none mb-4"
            style={{ letterSpacing: "0.3em" }}
          />
          <button
            onClick={handleVerifyCode}
            disabled={otp.length !== 8 || loading}
            className="border-none rounded-xl p-4 font-mono text-sm font-bold uppercase mb-3"
            style={{
              background: otp.length === 8 ? color.accent : color.borderMid,
              color: otp.length === 8 ? "#000" : color.dim,
              cursor: otp.length === 8 ? "pointer" : "not-allowed",
              letterSpacing: "0.1em",
            }}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(null); }}
              className="bg-transparent border-none text-dim font-mono text-xs cursor-pointer underline"
            >
              Different email
            </button>
            <button
              onClick={() => { setOtp(""); setError(null); handleSendCode(); }}
              className="bg-transparent border-none text-dim font-mono text-xs cursor-pointer underline"
            >
              Resend code
            </button>
          </div>
        </>
      )}

    </div>
  );
};

export default AuthScreen;
