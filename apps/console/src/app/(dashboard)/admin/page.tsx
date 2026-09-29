"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Spinner,
  StatTile,
} from "@liveflow/design-system";
import {
  connectAccount,
  createCreator,
  getAgencyId,
  getToken,
  listConnectedAccounts,
  listCreators,
  type ConnectedAccount,
  type Creator,
  type Platform,
} from "@liveflow/api-client";

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = [
  "CHATURBATE",
  "STRIPCHAT",
  "MYFREECAMS",
  "TWITCH",
  "YOUTUBE",
  "CUSTOM",
];

const PLATFORM_LABELS: Record<Platform, string> = {
  CHATURBATE: "Chaturbate",
  STRIPCHAT: "Stripchat",
  MYFREECAMS: "MyFreeCams",
  TWITCH: "Twitch",
  YOUTUBE: "YouTube",
  CUSTOM: "Custom RTMP",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage(): React.ReactElement {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newCreatorCreds, setNewCreatorCreds] = useState<{
    email: string;
    password: string;
    displayName: string;
  } | null>(null);

  const fetchCreators = useCallback(async () => {
    const token = getToken();
    const agencyId = getAgencyId();
    if (!token || !agencyId) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const data = await listCreators(agencyId, token);
      setCreators(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/403|forbidden|requires role/i.test(msg)) {
        setError(
          "Permessi insufficienti: l'Admin richiede un account OWNER o MANAGER. " +
            "Accedi alla Console con un account agenzia (es. demo@liveflow.dev), non con un account creator.",
        );
      } else {
        setError(msg || "Impossibile caricare i creator.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCreators();
  }, [fetchCreators]);

  const handleCreatorCreated = (
    creator: Creator,
    password: string,
  ) => {
    setCreators((prev) => [creator, ...prev]);
    setShowForm(false);
    setNewCreatorCreds({
      email: creator.email,
      password,
      displayName: creator.displayName,
    });
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 className="lf-section-title">Admin</h2>
          <p className="lf-section-desc">
            Manage creator accounts and platform assignments.
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            setShowForm(true);
            setNewCreatorCreds(null);
          }}
        >
          + Nuovo creator
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile
          label="Creator"
          value={creators.length}
          subValue="registered"
          accent="primary"
          icon={<CreatorIcon />}
        />
        <StatTile
          label="Piattaforme"
          value={creators.reduce((s, c) => s + (c.platforms?.length ?? 0), 0)}
          subValue="account assegnati"
          accent="accent"
          icon={<PlatformIcon />}
        />
        <StatTile
          label="Attive"
          value={creators.reduce(
            (s, c) => s + (c.platforms?.filter((p) => p.isActive).length ?? 0),
            0,
          )}
          subValue="account attivi"
          accent="success"
          icon={<ActiveIcon />}
        />
      </div>

      {/* Success banner: new creator credentials */}
      {newCreatorCreds && (
        <CredentialsBanner
          {...newCreatorCreds}
          onDismiss={() => setNewCreatorCreds(null)}
        />
      )}

      {/* New creator form */}
      {showForm && (
        <NewCreatorForm
          onCreated={handleCreatorCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Creator list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" variant="primary" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={fetchCreators} />
      ) : creators.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-4">
          {creators.map((creator) => (
            <CreatorRow
              key={creator.id}
              creator={creator}
              onPlatformAdded={(updated) =>
                setCreators((prev) =>
                  prev.map((c) => (c.id === updated.id ? updated : c)),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── NewCreatorForm ────────────────────────────────────────────────────────────

interface NewCreatorFormProps {
  onCreated: (creator: Creator, password: string) => void;
  onCancel: () => void;
}

function NewCreatorForm({ onCreated, onCancel }: NewCreatorFormProps): React.ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = displayName.trim() && email.trim() && password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const token = getToken();
    const agencyId = getAgencyId();
    if (!token || !agencyId) {
      setError("Not authenticated.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const creator = await createCreator(
        agencyId,
        { displayName, email, password },
        token,
      );
      onCreated(creator, password);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create creator.";
      setError(msg.includes("409") || msg.toLowerCase().includes("conflict")
        ? "Email gia' in uso. Scegli un indirizzo diverso."
        : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="elevated" padding="lg" glow="primary">
      <CardHeader
        title="Nuovo creator"
        description="Crea un account creator con credenziali di login."
      />
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Luna Star"
            required
            disabled={submitting}
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="luna@agency.com"
            required
            disabled={submitting}
          />
        </div>
        <Input
          label="Password (min. 8 caratteri)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          disabled={submitting}
          hint="Questa password verra' consegnata alla creator per il primo login."
        />

        {error && (
          <div role="alert" className="p-3 rounded-lg bg-danger-muted border border-danger/20 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary" size="md" disabled={!isValid || submitting}>
            {submitting ? <Spinner size="xs" variant="muted" /> : "Crea creator"}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
            Annulla
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ── CredentialsBanner ─────────────────────────────────────────────────────────

function CredentialsBanner({
  displayName,
  email,
  password,
  onDismiss,
}: {
  displayName: string;
  email: string;
  password: string;
  onDismiss: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="p-4 rounded-xl bg-success-muted border border-success/30 space-y-3"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-success">
            Creator creata con successo
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Consegna queste credenziali a <strong>{displayName}</strong> per il primo accesso all&apos;app creator.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Chiudi"
          className="text-text-muted hover:text-text-primary transition-colors duration-fast"
        >
          &times;
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CredField label="Email" value={email} />
        <CredField label="Password" value={password} sensitive />
      </div>
      <p className="text-xs text-text-muted">
        App creator: <span className="font-mono">http://localhost:3100</span>
        &nbsp;— dopo il primo login la creator potra' cambiare la password.
      </p>
    </div>
  );
}

function CredField({
  label,
  value,
  sensitive = false,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
}): React.ReactElement {
  const [visible, setVisible] = useState(!sensitive);

  const handleCopy = () => void navigator.clipboard?.writeText(value).catch(() => {});

  return (
    <div className="bg-bg-elevated rounded-lg p-3 border border-border">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="text-sm font-mono text-text-primary flex-1 truncate">
          {visible ? value : "••••••••"}
        </code>
        {sensitive && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-xs text-text-muted hover:text-text-primary transition-colors"
            aria-label={visible ? "Nascondi" : "Mostra"}
          >
            {visible ? "Nascondi" : "Mostra"}
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
          aria-label="Copia"
        >
          Copia
        </button>
      </div>
    </div>
  );
}

// ── CreatorRow ────────────────────────────────────────────────────────────────

interface CreatorRowProps {
  creator: Creator;
  onPlatformAdded: (updated: Creator) => void;
}

function CreatorRow({ creator, onPlatformAdded }: CreatorRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>(
    () =>
      creator.platforms?.map((p, i) => ({
        id: `local-${i}`,
        platform: p.platform,
        platformUsername: p.platformUsername,
        isActive: p.isActive,
        createdAt: "",
      })) ?? [],
  );

  const platformCount = accounts.length;

  const handleAccountConnected = (acct: ConnectedAccount) => {
    const updated = [...accounts, acct];
    setAccounts(updated);
    onPlatformAdded({
      ...creator,
      platforms: updated.map((a) => ({
        platform: a.platform,
        platformUsername: a.platformUsername,
        isActive: a.isActive,
      })),
    });
  };

  return (
    <Card variant="default" padding="none">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-center gap-4 hover:bg-bg-overlay transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-xl"
        aria-expanded={expanded}
      >
        <Avatar
          initials={creator.displayName.charAt(0)}
          alt={creator.displayName}
          size="md"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">
            {creator.displayName}
          </p>
          <p className="text-xs text-text-muted truncate">{creator.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={platformCount > 0 ? "accent" : "default"} size="sm">
            {platformCount} piattaforme
          </Badge>
          <span className="text-text-muted text-sm" aria-hidden="true">
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {/* Expanded platform panel */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* Existing accounts */}
          {accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                Piattaforme assegnate
              </p>
              <div className="flex flex-wrap gap-2">
                {accounts.map((acct) => (
                  <div
                    key={acct.id}
                    className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-lg px-2.5 py-1.5"
                  >
                    <Badge
                      variant={acct.isActive ? "success" : "default"}
                      size="sm"
                    >
                      {PLATFORM_LABELS[acct.platform as Platform] ?? acct.platform}
                    </Badge>
                    <span className="text-xs text-text-muted font-mono">
                      {acct.platformUsername}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add platform form */}
          <AddPlatformForm
            agencyId={getAgencyId() ?? ""}
            creatorId={creator.id}
            existingPlatforms={accounts.map((a) => a.platform as Platform)}
            onConnected={handleAccountConnected}
          />
        </div>
      )}
    </Card>
  );
}

// ── AddPlatformForm ───────────────────────────────────────────────────────────

interface AddPlatformFormProps {
  agencyId: string;
  creatorId: string;
  existingPlatforms: Platform[];
  onConnected: (acct: ConnectedAccount) => void;
}

function AddPlatformForm({
  agencyId,
  creatorId,
  existingPlatforms,
  onConnected,
}: AddPlatformFormProps): React.ReactElement {
  const available = PLATFORMS.filter((p) => !existingPlatforms.includes(p));

  const [platform, setPlatform] = useState<Platform>(available[0] ?? "CUSTOM");
  const [username, setUsername] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (available.length > 0) setPlatform(available[0]!);
  }, [available.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (available.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Tutte le piattaforme sono gia' configurate per questo creator.
      </p>
    );
  }

  const isValid = platform && username.trim() && streamKey.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    const token = getToken();
    if (!token) { setError("Not authenticated."); return; }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const acct = await connectAccount(
        agencyId,
        creatorId,
        { platform, platformUsername: username, streamKey },
        token,
      );
      setUsername("");
      setStreamKey("");
      setSuccess(true);
      onConnected(acct);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il salvataggio.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
        Aggiungi piattaforma
      </p>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        noValidate
      >
        {/* Platform select */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary" htmlFor={`platform-${creatorId}`}>
            Piattaforma
          </label>
          <select
            id={`platform-${creatorId}`}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            disabled={submitting}
            className="h-10 rounded-lg border border-border bg-bg-elevated text-sm text-text-primary px-3 focus:outline-none focus:ring-2 focus:ring-border-focus transition-colors duration-fast"
          >
            {available.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        {/* Username */}
        <Input
          label="Username piattaforma"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="myusername"
          required
          disabled={submitting}
        />

        {/* Stream key */}
        <Input
          label="Stream key"
          type="password"
          value={streamKey}
          onChange={(e) => setStreamKey(e.target.value)}
          placeholder="live_xxxx..."
          required
          disabled={submitting}
        />

        <Button
          type="submit"
          variant="accent"
          size="md"
          disabled={!isValid || submitting}
          className="self-end"
        >
          {submitting ? <Spinner size="xs" variant="muted" /> : "Salva"}
        </Button>
      </form>

      {error && (
        <div role="alert" className="text-xs text-danger bg-danger-muted rounded-lg px-3 py-2 border border-danger/20">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="text-xs text-success bg-success-muted rounded-lg px-3 py-2 border border-success/20">
          Piattaforma aggiunta con successo.
        </div>
      )}
    </div>
  );
}

// ── Empty / Error states ──────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
  return (
    <Card variant="ghost" padding="lg" className="text-center">
      <p className="text-text-secondary text-sm">Nessun creator registrato.</p>
      <p className="text-text-muted text-xs mt-1">
        Crea il primo account creator per iniziare.
      </p>
      <div className="mt-4">
        <Button variant="primary" size="sm" onClick={onAdd}>
          Crea primo creator
        </Button>
      </div>
    </Card>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 p-4 rounded-xl bg-danger-muted border border-danger/20"
    >
      <p className="text-sm text-danger">{message}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Riprova
      </Button>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CreatorIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16c0-3 2.686-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlatformIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 8l4 2.5L7 13V8z" fill="currentColor" />
    </svg>
  );
}

function ActiveIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
