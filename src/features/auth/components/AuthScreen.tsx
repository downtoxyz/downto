"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";
import Grain from "@/app/components/Grain";

const AuthScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [pendingAddUser, setPendingAddUser] = useState<string | null>(null);
  const [pendingCheck, setPendingCheck] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("pendingAddUsername");
    if (stored) setPendingAddUser(stored);
    if (localStorage.getItem("pendingCheckId")) setPendingCheck(true);
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
    <div
      style={{
        padding: "60px 24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Grain />

      <h1
        style={{
          fontFamily: font.serif,
          fontSize: 48,
          color: color.text,
          fontWeight: 400,
          marginBottom: 8,
        }}
      >
        down to
      </h1>
      <p
        style={{
          fontFamily: font.mono,
          fontSize: 13,
          color: color.dim,
          marginBottom: pendingAddUser ? 12 : 48,
        }}
      >
        from idea to squad in 10 seconds
      </p>
      {pendingCheck && !pendingAddUser && (
        <div
          style={{
            background: "rgba(232,255,90,0.08)",
            border: `1px solid rgba(232,255,90,0.2)`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 32,
          }}
        >
          <p style={{ fontFamily: font.mono, fontSize: 12, color: color.accent, margin: 0, lineHeight: 1.5 }}>
            sign up or log in to respond to this check
          </p>
          <p style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, margin: "4px 0 0" }}>
            quick setup, then you&apos;re in
          </p>
        </div>
      )}
      {pendingAddUser && (
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: color.accent,
            marginBottom: 36,
          }}
        >
          log in or create a profile to add @{pendingAddUser}
        </p>
      )}

      {error && (
        <p
          style={{
            fontFamily: font.mono,
            fontSize: 12,
            color: "#ff6b6b",
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      {step === "email" ? (
        <>
          <label
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: color.dim,
              marginBottom: 8,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
            placeholder="you@email.com"
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 18,
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            onClick={handleSendCode}
            disabled={!email.includes("@") || loading}
            style={{
              background: email.includes("@") ? color.accent : color.borderMid,
              color: email.includes("@") ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "16px",
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              cursor: email.includes("@") ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {loading ? "Sending..." : "Send Code"}
          </button>
        </>
      ) : (
        <>
          <p
            style={{
              fontFamily: font.mono,
              fontSize: 12,
              color: color.dim,
              marginBottom: 20,
            }}
          >
            We sent a code to<br />
            <span style={{ color: color.accent }}>{email}</span>
          </p>
          <label
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: color.dim,
              marginBottom: 8,
            }}
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
            style={{
              background: color.card,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              padding: "16px",
              color: color.text,
              fontFamily: font.mono,
              fontSize: 24,
              letterSpacing: "0.3em",
              textAlign: "center",
              outline: "none",
              marginBottom: 16,
            }}
          />
          <button
            onClick={handleVerifyCode}
            disabled={otp.length !== 8 || loading}
            style={{
              background: otp.length === 8 ? color.accent : color.borderMid,
              color: otp.length === 8 ? "#000" : color.dim,
              border: "none",
              borderRadius: 12,
              padding: "16px",
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              cursor: otp.length === 8 ? "pointer" : "not-allowed",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 12,
            }}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <button
              onClick={() => { setStep("email"); setOtp(""); setError(null); }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Different email
            </button>
            <button
              onClick={() => { setOtp(""); setError(null); handleSendCode(); }}
              style={{
                background: "transparent",
                border: "none",
                color: color.dim,
                fontFamily: font.mono,
                fontSize: 11,
                cursor: "pointer",
                textDecoration: "underline",
              }}
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