'use client'

import { useNodeDetail, useOverview } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/shared/status-badge'
import { BatteryIndicator, LinkQualityBar } from '@/components/shared/battery-indicator'
import { FreshnessLabel } from '@/components/shared/freshness-label'
import { LoadingSkeleton, ErrorState, EmptyState } from '@/components/shared/state-views'
import { DeploymentLockCard } from './deployment-lock-card'
import { DynamicModuleGrid } from './dynamic-module-grid'
import { NodeHealthChart } from './node-health-chart'
import { NodeSimulatorPanel } from './node-simulator-panel'
import {
  ArrowLeft,
  Radio,
  MapPin,
  Clock,
  Cpu,
  Activity,
  History,
  Settings2,
  ShieldCheck,
  AlertTriangle,
  Wifi,
  Zap,
  Users,
  Calendar,
  Hash,
  Siren,
  Lock,
  Navigation,
  Satellite,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RUNTIME_STATE_LABELS,
  LIFECYCLE_LABELS,
  MODULE_STATUS_LABELS,
  titleCase,
  timeAgo,
  formatDateTime,
  formatCoord,
  formatUptime,
  formatNum,
} from '@/lib/format'
import type { NodeModule } from '@/lib/types'

export function NodeDetailPage({ nodeId }: { nodeId: string }) {
  const setView = useAppStore((s) => s.setView)
  const { data: node, isLoading, isError, refetch } = useNodeDetail(nodeId)
  const { data: overview } = useOverview()

  if (isLoading) return <LoadingSkeleton rows={6} className="m-6" />
  if (isError)
    return (
      <ErrorState
        title="Could not load node"
        description="The node may not exist, or the gateway is unreachable."
        onRetry={() => refetch()}
        className="m-6"
      />
    )
  if (!node) return <EmptyState title="Node not found" className="m-6" />

  const state = RUNTIME_STATE_LABELS[node.runtime_state] ?? {
    label: titleCase(node.latest_heartbeat?.health_state ?? 'UNKNOWN'),
    tone: 'muted',
  }
  const hb = node.latest_heartbeat

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView({ name: 'nodes' })}
          className="text-muted-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Nodes
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{node.display_name}</h2>
            <StatusBadge tone={state.tone} label={state.label} pulse={node.online} />
            <StatusBadge tone="muted" label={LIFECYCLE_LABELS[node.lifecycle_state] ?? node.lifecycle_state} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3 w-3" /> {node.id}
            </span>
            {node.firmware_version && (
              <span className="inline-flex items-center gap-1">
                <Cpu className="h-3 w-3" /> FW {node.firmware_version}
              </span>
            )}
            {node.protocol_version && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Proto {node.protocol_version}
              </span>
            )}
            {node.hardware_revision && (
              <span className="inline-flex items-center gap-1">
                <Settings2 className="h-3 w-3" /> HW {node.hardware_revision}
              </span>
            )}
          </div>
        </div>
        {overview && (
          <div className="text-right">
            <FreshnessLabel timestamp={node.last_contact_at} label="Last contact" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              {node.last_contact_source === 'gateway_report'
                ? 'Observed via gateway report'
                : node.last_contact_source === 'heartbeat'
                  ? 'Device heartbeat'
                  : 'No contact recorded'}
            </p>
          </div>
        )}
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={<BatteryIndicator pct={hb?.battery ?? null} className="w-full justify-center" />}
          label="Battery"
          sub={hb?.supply_voltage != null ? `${hb.supply_voltage.toFixed(2)} V` : '—'}
        />
        <MetricCard
          icon={<Wifi className="h-4 w-4" />}
          label="Link quality"
          value={<LinkQualityBar quality={hb?.link_quality ?? null} />}
        />
        <MetricCard
          icon={<Zap className="h-4 w-4" />}
          label="Uptime"
          value={<span className="text-sm font-semibold tabular-nums">{formatUptime(hb?.uptime_seconds)}</span>}
        />
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          label="Connected clients"
          value={<span className="text-2xl font-bold tabular-nums">{formatNum(hb?.connected_clients)}</span>}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
          <TabsTrigger value="modules">
            Modules
            <span className="ml-1 rounded bg-muted-foreground/15 px-1 text-[10px]">
              {node.modules.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-4 w-4 text-muted-foreground" /> Health snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <Row label="Health state">
                  <StatusBadge
                    tone={
                      hb?.health_state === 'OK'
                        ? 'success'
                        : hb?.health_state === 'DEGRADED'
                          ? 'warning'
                          : hb?.health_state === 'FAULT'
                            ? 'danger'
                            : 'muted'
                    }
                    label={titleCase(hb?.health_state ?? 'UNKNOWN')}
                    size="sm"
                  />
                </Row>
                <Row label="Online">
                  <span className={node.online ? 'text-success' : 'text-muted-foreground'}>
                    {node.online ? 'Yes' : 'No'}
                  </span>
                </Row>
                <Row label="RSSI">
                  <span className="tabular-nums">
                    {hb?.rssi ? `${hb.rssi} dBm` : '—'}
                  </span>
                </Row>
                <Row label="Reported at">
                  <span className="tabular-nums">{formatDateTime(hb?.node_reported_at)}</span>
                </Row>
                <Row label="Received at">
                  <span className="tabular-nums">{formatDateTime(hb?.received_at)}</span>
                </Row>
                <Row label="Created">
                  <span className="tabular-nums">{formatDateTime(node.created_at)}</span>
                </Row>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="h-4 w-4 text-muted-foreground" /> Recent heartbeat history
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Received</th>
                        <th className="px-3 py-2 text-right font-medium">Bat%</th>
                        <th className="px-3 py-2 text-right font-medium">Link</th>
                        <th className="px-3 py-2 text-right font-medium">Clients</th>
                        <th className="px-3 py-2 text-left font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.heartbeat_history.map((h) => (
                        <tr key={h.id} className="border-b border-border/40 last:border-0">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {timeAgo(h.received_at)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.battery != null ? `${Math.round(h.battery)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.link_quality != null ? `${Math.round(h.link_quality)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {h.connected_clients ?? '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'inline-block h-1.5 w-1.5 rounded-full',
                                h.health_state === 'OK'
                                  ? 'bg-success'
                                  : h.health_state === 'DEGRADED'
                                    ? 'bg-warning'
                                    : h.health_state === 'FAULT'
                                      ? 'bg-danger'
                                      : 'bg-muted-foreground',
                              )}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Health trend chart */}
          {node.heartbeat_history.length >= 2 && (
            <NodeHealthChart heartbeats={node.heartbeat_history} />
          )}
        </TabsContent>

        {/* Location */}
        <TabsContent value="location" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DeploymentLockCard node={node} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Navigation className="h-4 w-4 text-muted-foreground" /> Current live location
                </CardTitle>
                <CardDescription className="text-xs">
                  Reported by GPS module where present.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {node.latest_location ? (
                  <>
                    <Row label="Coordinates">
                      <span className="font-mono text-xs">
                        {formatCoord(node.latest_location.latitude, node.latest_location.longitude)}
                      </span>
                    </Row>
                    <Row label="Source">
                      <StatusBadge
                        tone="info"
                        label={titleCase(node.latest_location.source)}
                        icon={<Satellite className="h-3 w-3" />}
                        size="sm"
                      />
                    </Row>
                    <Row label="Accuracy">
                      <span className="tabular-nums">
                        {node.latest_location.accuracy_m != null
                          ? `±${node.latest_location.accuracy_m} m`
                          : '—'}
                      </span>
                    </Row>
                    <Row label="Captured at">
                      <span className="tabular-nums">
                        {formatDateTime(node.latest_location.captured_at)}
                      </span>
                    </Row>
                    <Row label="Received at">
                      <span className="tabular-nums">
                        {formatDateTime(node.latest_location.received_at)}
                      </span>
                    </Row>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>
                      No current live position. Showing the locked deployment reference above as the
                      fallback. Label current location as unavailable.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {node.location_history.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="h-4 w-4 text-muted-foreground" /> Location history
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Captured</th>
                        <th className="px-3 py-2 text-left font-medium">Source</th>
                        <th className="px-3 py-2 text-left font-medium">Coordinates</th>
                        <th className="px-3 py-2 text-right font-medium">Accuracy</th>
                        <th className="px-3 py-2 text-center font-medium">Valid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.location_history.map((l) => (
                        <tr key={l.id} className="border-b border-border/40 last:border-0">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {timeAgo(l.captured_at)}
                          </td>
                          <td className="px-3 py-2">{titleCase(l.source)}</td>
                          <td className="px-3 py-2 font-mono text-[10px]">
                            {formatCoord(l.latitude, l.longitude)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.accuracy_m != null ? `±${l.accuracy_m} m` : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={cn(
                                'inline-block h-2 w-2 rounded-full',
                                l.valid ? 'bg-success' : 'bg-muted-foreground',
                              )}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <NodeSimulatorPanel nodeId={node.id} />
        </TabsContent>

        {/* Modules */}
        <TabsContent value="modules" className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-2.5 text-xs text-muted-foreground">
            <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
            <span>
              Module controls are rendered from validated capability reports only. Unknown module types
              are shown as <code>UNKNOWN</code> and their controls are suppressed. Node-supplied code is never executed.
            </span>
          </div>
          <DynamicModuleGrid node={node} />
        </TabsContent>

        {/* Events */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-muted-foreground" /> Node event log
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {node.events.length === 0 ? (
                <EmptyState title="No events recorded" className="py-8" />
              ) : (
                <div className="max-h-96 overflow-y-auto scrollbar-thin">
                  <ol className="divide-y divide-border">
                    {node.events.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 px-4 py-2.5">
                        <span
                          className={cn(
                            'mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full',
                            e.severity === 'critical'
                              ? 'bg-danger'
                              : e.severity === 'warning'
                                ? 'bg-warning'
                                : 'bg-muted-foreground',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm">{titleCase(e.event_type)}</span>
                            <StatusBadge
                              tone={
                                e.severity === 'critical'
                                  ? 'danger'
                                  : e.severity === 'warning'
                                    ? 'warning'
                                    : 'muted'
                              }
                              label={titleCase(e.severity)}
                              size="sm"
                            />
                          </div>
                          {e.payload && (
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-all">
                              {e.payload}
                            </p>
                          )}
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {formatDateTime(e.occurred_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incidents sourced */}
        <TabsContent value="incidents" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Siren className="h-4 w-4 text-muted-foreground" /> Incidents sourced from this node
              </CardTitle>
              <CardDescription className="text-xs">
                {node.incidents_sourced.length} total
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {node.incidents_sourced.length === 0 ? (
                <EmptyState title="No incidents from this node" className="py-8" />
              ) : (
                <ul className="divide-y divide-border">
                  {node.incidents_sourced.map((inc) => (
                    <li key={inc.id}>
                      <button
                        onClick={() => setView({ name: 'incident', incidentId: inc.id })}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50"
                      >
                        <Siren className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs font-semibold">{inc.id}</span>
                        <StatusBadge tone="muted" label={titleCase(inc.category)} size="sm" />
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {timeAgo(inc.created_at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value?: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-1.5 p-3 text-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {value && <div className="text-sm font-semibold">{value}</div>}
        {sub && <div className="text-[10px] tabular-nums text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function ModuleCard({ module }: { module: NodeModule }) {
  const status = MODULE_STATUS_LABELS[module.status] ?? { label: module.status, tone: 'muted' }
  const caps = module.capabilities.split(',').filter(Boolean)
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">{titleCase(module.module_type)}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{module.module_id}</div>
          </div>
        </div>
        <StatusBadge tone={status.tone} label={status.label} size="sm" />
      </div>
      {caps.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {caps.map((c) => (
            <span
              key={c}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{module.firmware_version ? `FW ${module.firmware_version}` : 'FW —'}</span>
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-2.5 w-2.5" /> {timeAgo(module.last_seen_at)}
        </span>
      </div>
    </div>
  )
}
