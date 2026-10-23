'use client'

import { useOverview } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { ApiRequestError } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import { BatteryIndicator, LinkQualityBar } from '@/components/shared/battery-indicator'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
} from '@/components/shared/state-views'
import {
  Radio,
  RadioTower,
  Siren,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Server,
  Database,
  Clock,
  ShieldCheck,
  HardDrive,
  ChevronRight,
  Users,
  Zap,
  MapPin,
  FileWarning,
  Cpu,
} from 'lucide-react'
import { QuickIncidentComposer } from './quick-incident-composer'
import { TrendsCard } from './trends-card'
import { cn } from '@/lib/utils'
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  RUNTIME_STATE_LABELS,
  LIFECYCLE_LABELS,
  timeAgo,
  formatDateTime,
  formatUptime,
  titleCase,
} from '@/lib/format'
import type { ReactNode } from 'react'

export function OverviewPage() {
  const { data, isLoading, isError, error, refetch } = useOverview()
  const setView = useAppStore((s) => s.setView)

  if (isLoading) return <LoadingSkeleton rows={6} />
  if (isError) {
    // Check if it's an auth error (session expired) vs a real gateway error
    const isAuthError = error instanceof ApiRequestError && error.status === 401
    return (
      <ErrorState
        title={isAuthError ? "Session expired" : "Could not load overview"}
        description={
          isAuthError
            ? "Your session has expired. The page will redirect to login shortly."
            : "The gateway may be unreachable. Check your connection to the Pi and try again."
        }
        onRetry={() => refetch()}
        className="m-6"
      />
    )
  }
  if (!data) return <EmptyState title="No data available" className="m-6" />

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Operator context + quick action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
            Welcome, {data.operator.display_name}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="tabular-nums">{new Date(data.generated_at).toLocaleString()}</span>
        </div>
        <QuickIncidentComposer />
      </div>

      {/* Top summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NetworkCard
          icon={<Radio className="h-4 w-4" />}
          label="Total nodes"
          value={data.network.total_nodes}
          sub={`${data.network.online} online`}
          tone={data.network.online > 0 ? 'success' : 'danger'}
          onClick={() => setView({ name: 'nodes' })}
        />
        <NetworkCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Offline / stale"
          value={data.network.offline + data.network.stale}
          sub={`${data.network.offline} offline · ${data.network.stale} stale`}
          tone={data.network.offline + data.network.stale > 0 ? 'warning' : 'success'}
          onClick={() => setView({ name: 'nodes' })}
        />
        <NetworkCard
          icon={<Siren className="h-4 w-4" />}
          label="Unacknowledged SOS"
          value={data.incidents.unacknowledged}
          sub={`${data.incidents.new} new`}
          tone={data.incidents.unacknowledged > 0 ? 'danger' : 'success'}
          pulse={data.incidents.unacknowledged > 0}
          onClick={() => setView({ name: 'incidents' })}
        />
        <NetworkCard
          icon={<Zap className="h-4 w-4" />}
          label="Critical incidents"
          value={data.incidents.critical}
          sub={`${data.incidents.in_progress} in progress`}
          tone={data.incidents.critical > 0 ? 'danger' : 'success'}
          pulse={data.incidents.critical > 0}
          onClick={() => setView({ name: 'incidents' })}
        />
      </div>

      {/* Trends chart */}
      <TrendsCard hours={24} />

      {/* Main grid */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Priority queue */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Siren className="h-4 w-4 text-danger" />
                Priority queue
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Sorted by severity then age. Critical first.
              </CardDescription>
            </div>
            <button
              onClick={() => setView({ name: 'incidents' })}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              All incidents <ChevronRight className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent className="p-0">
            {data.priority_queue.length === 0 ? (
              <EmptyState
                title="Queue is clear"
                description="No unacknowledged or in-progress incidents."
                icon={<CheckCircle2 className="h-6 w-6 text-success" />}
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.priority_queue.map((inc) => {
                  const cat = CATEGORY_LABELS[inc.category] ?? {
                    label: inc.category,
                    short: '—',
                  }
                  const pri = PRIORITY_LABELS[inc.priority] ?? {
                    label: inc.priority,
                    tone: 'muted',
                  }
                  const st = STATUS_LABELS[inc.status] ?? {
                    label: inc.status,
                    tone: 'muted',
                  }
                  return (
                    <li key={inc.id}>
                      <button
                        onClick={() => setView({ name: 'incident', incidentId: inc.id })}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold',
                            pri.tone === 'danger'
                              ? 'border-danger/30 bg-danger/10 text-danger'
                              : pri.tone === 'warning'
                                ? 'border-warning/30 bg-warning/15 text-warning-foreground'
                                : 'border-border bg-muted text-muted-foreground',
                          )}
                          title={cat.label}
                        >
                          {cat.short}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold">{inc.id}</span>
                            <StatusBadge tone={pri.tone} label={pri.label} size="sm" />
                            <StatusBadge tone={st.tone} label={st.label} size="sm" />
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-foreground/90">
                            {inc.description}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {timeAgo(inc.created_at)}
                            </span>
                            {inc.people_affected ? (
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3 w-3" /> {inc.people_affected} affected
                              </span>
                            ) : null}
                            {inc.assigned_to ? (
                              <span className="inline-flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> {inc.assigned_to}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-warning-foreground">
                                <FileWarning className="h-3 w-3" /> Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Gateway health */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" />
              Gateway health
            </CardTitle>
            <CardDescription className="text-xs">
              Raspberry Pi control center
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <HealthRow
              icon={<Activity className="h-3.5 w-3.5" />}
              label="API status"
              value={
                <StatusBadge
                  tone={data.gateway_health.api_status === 'ok' ? 'success' : 'danger'}
                  label={data.gateway_health.api_status === 'ok' ? 'OK' : 'Degraded'}
                  pulse={data.gateway_health.api_status === 'ok'}
                  size="sm"
                />
              }
            />
            <HealthRow
              icon={<Database className="h-3.5 w-3.5" />}
              label="Database"
              value={
                <StatusBadge
                  tone={
                    data.gateway_health.database_status === 'connected' ? 'success' : 'danger'
                  }
                  label={
                    data.gateway_health.database_status === 'connected' ? 'Connected' : 'Unreachable'
                  }
                  size="sm"
                />
              }
            />
            <HealthRow
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Uptime"
              value={<span className="tabular-nums">{formatUptime(data.gateway_health.uptime_seconds)}</span>}
            />
            <HealthRow
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="Storage"
              value={<span className="text-xs">{data.gateway_health.storage_note}</span>}
            />
            <HealthRow
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Last backup"
              value={
                data.gateway_health.last_backup_at ? (
                  <span className="tabular-nums text-xs">
                    {timeAgo(data.gateway_health.last_backup_at)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Never</span>
                )
              }
            />
            <div className="pt-1.5 text-[11px] text-muted-foreground">
              Server time: {formatDateTime(data.gateway_health.server_time)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Node health + recent activity */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <RadioTower className="h-4 w-4 text-muted-foreground" />
                Node health
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Recent gateway contact; battery and link metrics appear when heartbeats report them.
              </CardDescription>
            </div>
            <FreshnessLabel timestamp={data.freshness.last_updated_at} />
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Node</th>
                    <th className="px-2 py-2 text-left font-medium">State</th>
                    <th className="hidden px-2 py-2 text-left font-medium sm:table-cell">Battery</th>
                    <th className="hidden px-2 py-2 text-left font-medium md:table-cell">Link</th>
                    <th className="px-4 py-2 text-right font-medium">Last contact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.node_health.map((n) => {
                    const state = RUNTIME_STATE_LABELS[n.runtime_state] ?? {
                      label: titleCase(n.health_state),
                      tone: 'muted',
                    }
                    return (
                      <tr
                        key={n.id}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50"
                        onClick={() => setView({ name: 'node', nodeId: n.id })}
                      >
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{n.display_name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{n.id}</div>
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusBadge tone={state.tone} label={state.label} size="sm" pulse={n.online} />
                        </td>
                        <td className="hidden px-2 py-2.5 sm:table-cell">
                          <BatteryIndicator pct={n.battery} />
                        </td>
                        <td className="hidden px-2 py-2.5 md:table-cell">
                          <LinkQualityBar quality={n.link_quality} />
                        </td>
                        <td
                          className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground"
                          title={n.last_contact_source === 'gateway_report'
                            ? 'Most recent report observed through the USB gateway; not a device heartbeat.'
                            : n.last_contact_source === 'heartbeat'
                              ? 'Most recent authenticated device heartbeat.'
                              : 'No gateway report or heartbeat has been recorded.'}
                        >
                          {timeAgo(n.last_contact_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent activity
            </CardTitle>
            <CardDescription className="text-xs">
              Incidents, node events, and operator actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <ol className="relative space-y-0">
                {data.recent_activity.map((a, i) => (
                  <li
                    key={`${a.kind}-${a.id}`}
                    className="relative flex gap-3 px-4 py-2.5 text-sm"
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card text-[10px] font-bold',
                        a.severity === 'critical'
                          ? 'border-danger/40 text-danger'
                          : a.severity === 'warning'
                            ? 'border-warning/40 text-warning-foreground'
                            : a.kind === 'incident'
                              ? 'border-info/40 text-info'
                              : a.kind === 'node'
                                ? 'border-success/40 text-success'
                                : 'border-border text-muted-foreground',
                      )}
                    >
                      {a.kind === 'incident' ? (
                        <Siren className="h-3 w-3" />
                      ) : a.kind === 'node' ? (
                        <Radio className="h-3 w-3" />
                      ) : (
                        <ShieldCheck className="h-3 w-3" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatActivityLabel(a.event_type)}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {a.actor}
                        </span>
                      </div>
                      {a.note && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {truncate(a.note, 120)}
                        </p>
                      )}
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {a.entity_label && (
                          <span className="font-mono">
                            {a.entity_id ?? a.entity_label}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {timeAgo(a.timestamp)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function NetworkCard({
  icon,
  label,
  value,
  sub,
  tone,
  pulse,
  onClick,
}: {
  icon: ReactNode
  label: string
  value: number
  sub: string
  tone: 'success' | 'warning' | 'danger'
  pulse?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-lg border bg-card p-3.5 text-left transition-all hover:shadow-md',
        tone === 'danger' && 'border-danger/30',
        tone === 'warning' && 'border-warning/30',
        tone === 'success' && 'border-border',
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          tone === 'danger' && 'bg-danger/10 text-danger',
          tone === 'warning' && 'bg-warning/15 text-warning-foreground',
          tone === 'success' && 'bg-success/10 text-success',
        )}
      >
        {icon}
        {pulse && (
          <span className="absolute right-3 top-3 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
        <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-[11px] text-muted-foreground/80">{sub}</div>
      </div>
    </button>
  )
}

function HealthRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function formatActivityLabel(t: string): string {
  return t
    .split(/[._]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  // try to parse JSON for cleaner display
  try {
    const o = JSON.parse(s)
    return JSON.stringify(o).slice(0, n) + '…'
  } catch {
    return s.slice(0, n) + '…'
  }
}
