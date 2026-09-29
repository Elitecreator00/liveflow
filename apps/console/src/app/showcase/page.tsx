"use client";

/**
 * LiveFlow Design System Showcase
 * Visual approval page — all tokens + components in premium dark theme.
 * Route: /showcase (no dashboard layout — standalone page)
 */

import React, { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  Badge,
  StatusDot,
  StatTile,
  Spinner,
  LiveTile,
  DataTable,
  Avatar,
  AvatarGroup,
  Input,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Toggle,
  PageContainer,
  Grid,
  Stack,
  type ColumnDef,
} from "@liveflow/design-system";

function ShowcaseSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-6">
      <div className="space-y-1 border-b border-border pb-4">
        <h2 className="text-2xl font-bold text-text-primary tracking-tight">{title}</h2>
        {description && <p className="text-sm text-text-secondary">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

function Swatch({
  name,
  hex,
  className,
}: {
  name: string;
  hex: string;
  className?: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={["w-full h-12 rounded-lg border border-border", className].filter(Boolean).join(" ")}
        style={{ background: hex }}
        title={hex}
      />
      <div>
        <p className="text-xs font-semibold text-text-primary">{name}</p>
        <p className="text-2xs font-mono text-text-muted">{hex}</p>
      </div>
    </div>
  );
}

interface SampleRow {
  id: string;
  name: string;
  platform: string;
  viewers: number;
  status: "live" | "offline" | "warn";
}

const SAMPLE_ROWS: SampleRow[] = [
  { id: "1", name: "creator_alpha",   platform: "Chaturbate", viewers: 1200, status: "live"    },
  { id: "2", name: "creator_beta",    platform: "Stripchat",  viewers: 870,  status: "live"    },
  { id: "3", name: "creator_gamma",   platform: "MyFreeCams", viewers: 0,    status: "offline" },
  { id: "4", name: "creator_delta",   platform: "Twitch",     viewers: 340,  status: "warn"    },
  { id: "5", name: "creator_epsilon", platform: "YouTube",    viewers: 2100, status: "live"    },
];

const TABLE_COLUMNS: ColumnDef<SampleRow>[] = [
  {
    key: "name",
    header: "Creator",
    accessor: (row) => (
      <div className="flex items-center gap-2.5">
        <Avatar initials={row.name[0] ?? "?"} size="sm" />
        <span className="font-medium text-text-primary">{row.name}</span>
      </div>
    ),
    sortable: true,
  },
  {
    key: "platform",
    header: "Platform",
    accessor: (row) => <Badge variant="default" size="sm">{row.platform}</Badge>,
  },
  {
    key: "status",
    header: "Status",
    accessor: (row) => <StatusDot status={row.status} showLabel size="sm" />,
  },
  {
    key: "viewers",
    header: "Viewers",
    align: "right",
    accessor: (row) => (
      <span className="font-mono text-sm text-text-secondary">
        {row.status === "live" ? row.viewers.toLocaleString() : "—"}
      </span>
    ),
    sortable: true,
  },
];

export default function ShowcasePage(): React.ReactElement {
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [tabValue, setTabValue] = useState("overview");
  const [pillTab, setPillTab] = useState("all");
  const [sortKey, setSortKey] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      if (sortDir === "desc") setSortKey(undefined);
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div
      data-theme="dark"
      className="lf-dark min-h-screen bg-bg-base text-text-primary font-sans antialiased"
    >
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-60 w-[600px] h-[600px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 rounded-full bg-cyan-500/6 blur-[80px]" />
        <div className="absolute bottom-0 left-1/3 w-96 h-96 rounded-full bg-violet-800/6 blur-[100px]" />
      </div>

      <header className="sticky top-0 z-50 bg-bg-glass backdrop-blur-glass border-b border-border-glass">
        <PageContainer>
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <LiveFlowLogo />
              <span className="text-base font-bold text-text-primary tracking-tight">LiveFlow</span>
              <span className="ml-2 text-xs text-text-muted">Design System</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="primary" size="sm" dot>Premium Dark</Badge>
              <Badge variant="accent" size="sm">v0.2</Badge>
            </div>
          </div>
        </PageContainer>
      </header>

      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
        <PageContainer>
          <div className="py-16 text-center space-y-5 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-muted/60 border border-violet-600/20 text-xs font-semibold text-primary-hover mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              Silicon Valley Premium Theme
            </div>
            <h1 className="text-5xl font-extrabold text-text-primary tracking-tight">
              <span className="bg-gradient-brand bg-clip-text text-transparent">Design System</span>{" "}Showcase
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Premium dark aesthetics built for 24/7 professional operations.
            </p>
            <div className="flex items-center justify-center gap-4 pt-2">
              <Button variant="primary" size="lg">Go Live</Button>
              <Button variant="outline" size="lg">View Docs</Button>
              <Button variant="ghost" size="lg">Learn More</Button>
            </div>
          </div>
        </PageContainer>
      </div>

      <PageContainer maxWidth="xl">
        <div className="py-12 space-y-20">
          <ShowcaseSection title="Color Palette" description="Semantic tokens on cool-blue-violet near-black.">
            <div className="space-y-8">
              <div>
                <Label>Backgrounds</Label>
                <Grid cols={6} gap="sm">
                  <Swatch name="Base" hex="#05060b" />
                  <Swatch name="Surface" hex="#090b12" />
                  <Swatch name="Elevated" hex="#0d1018" />
                  <Swatch name="Subtle" hex="#111520" />
                  <Swatch name="Overlay" hex="#161c2a" />
                  <Swatch name="Glass" hex="rgba(9,11,18,0.75)" />
                </Grid>
              </div>
              <div>
                <Label>Brand — Violet</Label>
                <Grid cols={6} gap="sm">
                  {(["#0c0418","#180832","#2a1060","#3c1a88","#5228b0","#6d35d4","#8b58e8","#aa7ef2","#ccaaf8","#ead5fe"] as const).map((hex, i) => (
                    <Swatch key={hex} name={`Violet ${[950,900,800,700,600,500,400,300,200,100][i]}`} hex={hex} />
                  ))}
                </Grid>
              </div>
              <div>
                <Label>Semantic Status</Label>
                <Grid cols={5} gap="sm">
                  <Swatch name="Success" hex="#34d399" />
                  <Swatch name="Warning" hex="#fbbf24" />
                  <Swatch name="Danger" hex="#f87171" />
                  <Swatch name="Live" hex="#f87171" />
                  <Swatch name="Offline" hex="#384059" />
                </Grid>
              </div>
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Buttons" description="Gradient fills, micro-scale active state, accessible focus rings.">
            <Stack gap="lg">
              <div>
                <Label>Variants</Label>
                <Stack direction="horizontal" gap="sm" wrap align="center">
                  <Button variant="primary">Primary</Button>
                  <Button variant="accent">Accent</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                </Stack>
              </div>
              <div>
                <Label>Sizes</Label>
                <Stack direction="horizontal" gap="sm" wrap align="center">
                  <Button variant="primary" size="xs">XSmall</Button>
                  <Button variant="primary" size="sm">Small</Button>
                  <Button variant="primary" size="md">Medium</Button>
                  <Button variant="primary" size="lg">Large</Button>
                </Stack>
              </div>
              <div>
                <Label>States</Label>
                <Stack direction="horizontal" gap="sm" wrap align="center">
                  <Button variant="primary" loading>Loading</Button>
                  <Button variant="primary" disabled>Disabled</Button>
                  <Button variant="accent" leftIcon={<span aria-hidden="true">◉</span>}>Go Live</Button>
                  <Button variant="outline" rightIcon={<span aria-hidden="true">→</span>}>Details</Button>
                </Stack>
              </div>
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Badges" description="Compact status labels with optional dot indicator.">
            <Stack gap="md">
              <div>
                <Label>Variants</Label>
                <Stack direction="horizontal" gap="sm" wrap align="center">
                  <Badge variant="default">Default</Badge>
                  <Badge variant="primary">Primary</Badge>
                  <Badge variant="accent">Accent</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warn">Warning</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="outline">Outline</Badge>
                </Stack>
              </div>
              <div>
                <Label>With Dot</Label>
                <Stack direction="horizontal" gap="sm" wrap align="center">
                  <Badge variant="primary" dot>Live</Badge>
                  <Badge variant="success" dot>Online</Badge>
                  <Badge variant="warn" dot>Degraded</Badge>
                  <Badge variant="danger" dot>Critical</Badge>
                </Stack>
              </div>
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Status Dots" description="Stream / connection status indicators.">
            <Grid cols={{ base: 2, sm: 3, lg: 6 }} gap="md">
              {(["live", "success", "warn", "offline", "idle"] as const).map((status) => (
                <div key={status} className="flex flex-col items-center gap-3 p-4 bg-bg-surface rounded-xl border border-border">
                  <StatusDot status={status} size="lg" />
                  <StatusDot status={status} size="md" showLabel />
                  <StatusDot status={status} size="sm" showLabel />
                </div>
              ))}
            </Grid>
          </ShowcaseSection>

          <ShowcaseSection title="Stat Tiles" description="KPI cards with gradient accent line and trend indicators.">
            <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap="md">
              <StatTile label="Live Sessions" value="12" subValue="across all platforms" trend="up" trendLabel="+3 from yesterday" accent="danger" icon={<LiveDot />} />
              <StatTile label="Total Viewers" value="5,234" subValue="right now" trend="up" trendLabel="+18%" accent="accent" />
              <StatTile label="Revenue Today" value="$1,847" subValue="all creators" trend="up" trendLabel="+$342 vs avg" accent="success" />
              <StatTile label="Uptime" value="99.8%" subValue="last 30 days" trend="neutral" trendLabel="stable" accent="primary" />
            </Grid>
          </ShowcaseSection>

          <ShowcaseSection title="Cards" description="Surface containers.">
            <Grid cols={{ base: 1, md: 2, lg: 4 }} gap="md">
              <Card variant="default" padding="md">
                <CardHeader title="Default" description="Standard surface" />
                <p className="text-sm text-text-secondary">bg-surface with gradient overlay.</p>
              </Card>
              <Card variant="elevated" padding="md">
                <CardHeader title="Elevated" description="Modals and popovers" />
                <p className="text-sm text-text-secondary">Visual hierarchy above default.</p>
              </Card>
              <Card variant="default" padding="md" glow="primary">
                <CardHeader title="Glow Primary" description="Violet glow effect" />
                <p className="text-sm text-text-secondary">For active states.</p>
              </Card>
              <Card variant="elevated" padding="md" glow="accent">
                <CardHeader title="Glow Accent" description="Cyan glow effect" />
                <p className="text-sm text-text-secondary">For live data panels.</p>
              </Card>
            </Grid>
          </ShowcaseSection>

          <ShowcaseSection title="Inputs / Fields" description="Form controls with label, description, error states.">
            <Grid cols={{ base: 1, md: 2 }} gap="lg">
              <Input label="Email Address" placeholder="you@agency.com" type="email" />
              <Input label="With Error" error="Email is required" placeholder="you@agency.com" type="email" />
              <Input label="With Adornments" leftAdornment={<span className="text-xs">@</span>} placeholder="platformusername" />
              <Textarea label="Stream Title" placeholder="Saturday night special show…" />
            </Grid>
          </ShowcaseSection>

          <ShowcaseSection title="Avatars" description="User and creator avatars with ring states.">
            <Stack gap="lg">
              <div>
                <Label>Sizes</Label>
                <Stack direction="horizontal" gap="md" align="center">
                  <Avatar initials="XS" size="xs" />
                  <Avatar initials="SM" size="sm" />
                  <Avatar initials="MD" size="md" />
                  <Avatar initials="LG" size="lg" />
                  <Avatar initials="XL" size="xl" />
                </Stack>
              </div>
              <div>
                <Label>Avatar Group</Label>
                <AvatarGroup
                  size="md"
                  avatars={[
                    { initials: "AB" }, { initials: "CD" }, { initials: "EF" },
                    { initials: "GH" }, { initials: "IJ" }, { initials: "KL" },
                  ]}
                  max={4}
                />
              </div>
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Tabs" description="Three variants: default, pills, underline.">
            <Stack gap="xl">
              <div>
                <Label>Default Variant</Label>
                <Tabs value={tabValue} onValueChange={setTabValue}>
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="streams">Streams</TabsTrigger>
                    <TabsTrigger value="analytics">Analytics</TabsTrigger>
                  </TabsList>
                  <div className="mt-6">
                    <TabsContent value="overview"><Card variant="default" padding="md"><p className="text-sm text-text-secondary">Overview content panel</p></Card></TabsContent>
                    <TabsContent value="streams"><Card variant="default" padding="md"><p className="text-sm text-text-secondary">Streams content panel</p></Card></TabsContent>
                    <TabsContent value="analytics"><Card variant="default" padding="md"><p className="text-sm text-text-secondary">Analytics content panel</p></Card></TabsContent>
                  </div>
                </Tabs>
              </div>
              <div>
                <Label>Pills Variant</Label>
                <Tabs value={pillTab} onValueChange={setPillTab}>
                  <TabsList variant="pills">
                    <TabsTrigger value="all" variant="pills">All (8)</TabsTrigger>
                    <TabsTrigger value="live" variant="pills">Live (3)</TabsTrigger>
                    <TabsTrigger value="warn" variant="pills">Warn (1)</TabsTrigger>
                    <TabsTrigger value="offline" variant="pills">Offline (4)</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Toggle / Switch" description="Accessible switch with gradient track.">
            <Stack gap="md">
              <Toggle checked={toggleA} onChange={setToggleA} label="Stream notifications" description="Receive alerts when streams start or go offline" />
              <Toggle checked={toggleB} onChange={setToggleB} label="Auto-record sessions" description="Automatically save all live stream recordings" />
              <Toggle checked={true} onChange={() => {}} label="Disabled toggle" disabled />
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="Spinners" description="SVG-based loading indicators.">
            <Stack direction="horizontal" gap="lg" align="center" wrap>
              {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
                <div key={size} className="flex flex-col items-center gap-3">
                  <Spinner size={size} variant="primary" />
                  <span className="text-2xs text-text-muted">{size}</span>
                </div>
              ))}
            </Stack>
          </ShowcaseSection>

          <ShowcaseSection title="DataTable" description="Sortable, accessible data grid.">
            <DataTable
              columns={TABLE_COLUMNS}
              rows={SAMPLE_ROWS}
              sortKey={sortKey}
              sortDirection={sortDir}
              onSort={handleSort}
              onRowClick={(row) => console.log("row clicked:", row.name)}
            />
          </ShowcaseSection>

          <ShowcaseSection title="Live Tiles" description="Stream preview cards for the monitoring wall.">
            <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap="md">
              <LiveTile creatorName="creator_alpha" platformName="Chaturbate" platformIcon={<span className="text-xs font-bold">CB</span>} status="live" quality="excellent" bitrate="4500 kbps" viewerCount={1247} duration="01:23:45" title="Saturday Night Special" onAction={() => {}} actionLabel="Details" />
              <LiveTile creatorName="creator_beta" platformName="Stripchat" platformIcon={<span className="text-xs font-bold">SC</span>} status="live" quality="good" viewerCount={870} duration="00:45:12" onAction={() => {}} />
              <LiveTile creatorName="creator_gamma" platformName="MyFreeCams" platformIcon={<span className="text-xs font-bold">MFC</span>} status="warn" quality="degraded" bitrate="1200 kbps" onAction={() => {}} />
              <LiveTile creatorName="creator_delta" platformName="Twitch" platformIcon={<span className="text-xs font-bold">TW</span>} status="offline" quality="offline" />
            </Grid>
          </ShowcaseSection>
        </div>
      </PageContainer>

      <footer className="border-t border-border mt-8 py-8">
        <PageContainer>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
            <span>LiveFlow Design System — Premium Silicon Valley Dark Theme</span>
            <div className="flex items-center gap-4">
              <span>Violet <span className="font-mono text-primary">#6d35d4</span></span>
              <span>Cyan <span className="font-mono text-accent">#18c0e0</span></span>
            </div>
          </div>
        </PageContainer>
      </footer>
    </div>
  );
}

function LiveFlowLogo({ size = 28 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--lf-primary)" />
      <path d="M8 20 L13 12 L16 17 L19 14 L24 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="24" cy="10" r="3" fill="var(--lf-live)" />
    </svg>
  );
}

function LiveDot(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}
