"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Spinner } from "@liveflow/design-system";
import { login, ApiError } from "@liveflow/api-client";
import { saveAuth, decodeJwtPayload } from "@liveflow/api-client";

export default function CreatorLoginPage(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { accessToken } = await login({ email, password });
      const payload = decodeJwtPayload(accessToken);
      saveAuth(accessToken, {
        id: String(payload?.sub ?? ""),
        email,
        agencyId: String(payload?.agencyId ?? ""),
        role: String(payload?.role ?? ""),
      });
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? "Email o password non validi."
            : `Accesso fallito (${err.status}). Riprova.`,
        );
      } else {
        setError("Impossibile raggiungere il server. Verifica la connessione.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-accent/8 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-fade-in">
        <div className="flex items-center justify-center gap-3 mb-8">
          <LiveFlowLogo />
          <div>
            <p className="text-2xl font-bold text-text-primary tracking-tight">LiveFlow</p>
            <p className="text-xs text-text-muted -mt-0.5">Creator</p>
          </div>
        </div>

        <Card variant="default" padding="lg" className="border-border-strong">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-text-primary">Accedi</h1>
            <p className="text-sm text-text-secondary mt-1">
              Accesso creator — vai live in un tap.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.com"
                className="lf-input"
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="lf-input"
              />
            </div>

            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger-muted border border-danger/30 text-sm text-danger"
              >
                <span aria-hidden="true" className="text-base">!</span>
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              loading={loading}
              disabled={loading || !email || !password}
              className="mt-2"
            >
              {loading ? "Accesso…" : "Accedi"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function LiveFlowLogo(): React.ReactElement {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="var(--lf-primary)" />
      <path
        d="M8 20 L13 12 L16 17 L19 14 L24 20"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="24" cy="10" r="3" fill="var(--lf-live)" className="animate-pulse-live" />
    </svg>
  );
}
