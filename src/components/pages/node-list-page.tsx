'use client'

import { useState } from 'react'
import { useNodes, useOverview } from '@/lib/hooks'
import { useAppStore } from '@/lib/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FilterPresetsBar } from './filter-presets-bar'
import { Button } from '@/components/ui/button'
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
  Search,
  Plus,
  ChevronRight,
  Clock,
  Users,
  Cpu,
  MapPin,
  Wifi,
  Filter,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RUNTIME_STATE_LABELS,
  LIFECYCLE_LABELS,
  titleCase,
  timeAgo,
  formatCoord,
} from '@/lib/format'
import type { RuntimeState } from '@/lib/types'

const STATUS_FILTERS: { value: string; label: string; tone: 'muted' | 'success' | 'warning' | 'danger' }[] = [
  { value: 'all', label: 'All', tone: 'muted' },
  { value: 'online', label: 'Online', tone: 'success' },
  { value: 'stale', label: 'Stale', tone: 'warning' },
  { value: 'offline', label: 'Offline', tone: 'muted' },
  { value: 'fault', label: 'Fault', tone: 'danger' },
]

export function NodeListPage() {
  const [status, setStatus] = useState<string>('all')
  const [q, setQ] = useState('')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const setView = useAppStore((s) => s.setView)
  const { data: overview } = useOverview()
  const { data, isLoading, isError, refetch } = useNodes({
    status: status !== 'all' ? status : undefined,
    q: q || undefined,
  })

  const applyPreset = (filters: { status?: string; q?: string }) => {
    setStatus(filters.status ?? 'all')
    setQ(filters.q ?? '')
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Saved filter presets */}
      <FilterPresetsBar
        type="node"
        currentFilters={{ status, q }}
        onApply={applyPreset}
        activePresetId={activePresetId}
        onActiveChange={setActivePresetId}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search node ID or name…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          <Filter className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                status === f.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {overview && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              <FreshnessLabel timestamp={overview.freshness.last_updated_at} />
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => setView({ name: 'nodes' })}>
            <Plus className="mr-1 h-4 w-4" /> Register node
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-muted-foreground" />
            Node inventory
            {data && (
              <span className="text-xs font-normal text-muted-foreground">
                · {data.total} {data.total === 1 ? 'node' : 'nodes'}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : isError ? (
            <ErrorState
              title="Could not load nodes"
              description="The gateway may be unreachable."
              onRetry={() => refetch()}
              className="m-6"
            />
          ) : !data || data.nodes.length === 0 ? (
            <EmptyState
              title="No nodes found"
              description={
                q || status !== 'all'
                  ? 'No nodes match the current filters.'
                  : 'No nodes have been registered yet.'
              }
              icon={<Radio className="h-6 w-6" />}
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Node</th>
                    <th className="px-3 py-2.5 text-left font-medium">State</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">Lifecycle</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Battery</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Link</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium xl:table-cell">Clients</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium 2xl:table-cell">Modules</th>
                    <th className="px-4 py-2.5 text-right font-medium">Last contact</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {data.nodes.map((n) => {
                    const state = RUNTIME_STATE_LABELS[n.runtime_state as RuntimeState] ?? {
                      label: titleCase(n.health_state),
                      tone: 'muted',
                    }
                    return (
                      <tr
                        key={n.id}
                        onClick={() => setView({ name: 'node', nodeId: n.id })}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{n.display_name}</div>
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">{n.id}</div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge tone={state.tone} label={state.label} size="sm" pulse={n.online} />
                        </td>
                        <td className="hidden px-3 py-3 text-xs lg:table-cell">
                          {LIFECYCLE_LABELS[n.lifecycle_state] ?? n.lifecycle_state}
                        </td>
                        <td className="hidden px-3 py-3 sm:table-cell">
                          <BatteryIndicator pct={n.battery} />
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">
                          <LinkQualityBar quality={n.link_quality} />
                        </td>
                        <td className="hidden px-3 py-3 text-xs tabular-nums text-muted-foreground xl:table-cell">
                          {n.connected_clients ?? '—'}
                        </td>
                        <td className="hidden px-3 py-3 2xl:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {n.module_summary.slice(0, 3).map((m, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium"
                                title={`${m.type}: ${m.status}`}
                              >
                                <Cpu className="h-2.5 w-2.5" />
                                {m.type}
                              </span>
                            ))}
                            {n.module_summary.length > 3 && (
                              <span className="text-[9px] text-muted-foreground">
                                +{n.module_summary.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground"
                          title={n.last_contact_source === 'gateway_report'
                            ? 'Most recent report observed through the USB gateway; not a device heartbeat.'
                            : n.last_contact_source === 'heartbeat'
                              ? 'Most recent authenticated device heartbeat.'
                              : 'No gateway report or heartbeat has been recorded.'}
                        >
                          {timeAgo(n.last_contact_at)}
                        </td>
                        <td className="pr-3">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card view for compact summary */}
      {data && data.nodes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.nodes.slice(0, 6).map((n) => {
            const state = RUNTIME_STATE_LABELS[n.runtime_state as RuntimeState] ?? {
              label: titleCase(n.health_state),
              tone: 'muted',
            }
            return (
              <Card
                key={n.id}
                className="cursor-pointer transition-all hover:shadow-md"
                onClick={() => setView({ name: 'node', nodeId: n.id })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{n.display_name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{n.id}</div>
                    </div>
                    <StatusBadge tone={state.tone} label={state.label} size="sm" pulse={n.online} />
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <Wifi className="h-3 w-3" /> Link
                      </span>
                      <LinkQualityBar quality={n.link_quality} className="scale-90" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Deployment
                      </span>
                      <span className="font-mono text-[10px]">
                        {n.deployment_lat != null
                          ? formatCoord(n.deployment_lat, n.deployment_lon).split(',')[0]
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> Clients
                      </span>
                      <span className="tabular-nums">{n.connected_clients ?? '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Last heartbeat
                      </span>
                      <span>{timeAgo(n.last_heartbeat)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
