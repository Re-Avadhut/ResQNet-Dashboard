'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  Cpu,
  Satellite,
  Camera,
  Thermometer,
  Activity,
  Lock,
  MapPin,
  AlertTriangle,
  Radio,
  Zap,
} from 'lucide-react'
import {
  MODULE_STATUS_LABELS,
  titleCase,
  formatCoord,
  formatDateTime,
  timeAgo,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { NodeModule, NodeLocation } from '@/lib/types'
import { parseImuSample } from '@/lib/imu-telemetry'

type DynamicModuleGridProps = {
  node: {
    id: string
    display_name: string
    modules: NodeModule[]
    latest_location: NodeLocation | null
    deployment_lat: number | null
    deployment_lon: number | null
  }
}

/**
 * Capability-driven module grid (spec §6.6):
 *   - Renders only known, allowlisted module types.
 *   - For GPS: shows current fix or "no fix" message (never shows stale as current).
 *   - For IMU: displays only the latest validated sample stored by the gateway API.
 *   - Camera and environment functionality stays explicitly unavailable until live integrations exist.
 *   - For unknown/invalid: shows a safe diagnostic message; never executes arbitrary code.
 */
export function DynamicModuleGrid({ node }: DynamicModuleGridProps) {
  const known = node.modules.filter((m) =>
    ['GPS', 'CAMERA', 'IMU', 'ENVIRONMENT', 'LORA', 'BATTERY', 'STORAGE', 'DISPLAY'].includes(m.module_type),
  )
  const unknown = node.modules.filter(
    (m) => !['GPS', 'CAMERA', 'IMU', 'ENVIRONMENT', 'LORA', 'BATTERY', 'STORAGE', 'DISPLAY'].includes(m.module_type),
  )

  if (node.modules.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Cpu className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">No modules reported</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The node has not submitted a valid capability report, or has no optional modules.
              Core node health and the deployment reference are still shown.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {known.map((m) => (
          <ModuleControls key={m.id} module={m} node={node} />
        ))}
      </div>
      {unknown.length > 0 && (
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-danger/10 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="text-sm">
              <p className="font-medium">{unknown.length} unknown module(s) detected</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The descriptor contained module types not on the allowlist ({unknown.map((m) => m.module_type).join(', ')}).
                These are marked <code>UNKNOWN</code> and their controls are not rendered. The capability report
                was rejected by the validator.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ModuleControls({
  module,
  node,
}: {
  module: NodeModule
  node: DynamicModuleGridProps['node']
}) {
  const status = MODULE_STATUS_LABELS[module.status] ?? {
    label: module.status,
    tone: 'muted',
  }
  const online = module.status === 'PRESENT_ONLINE'
  const Icon = MODULE_ICONS[module.module_type] ?? Cpu
  const caps = module.capabilities.split(',').filter(Boolean)

  return (
    <Card className={cn('transition-shadow', online && 'shadow-sm')}>
      <CardHeader className="pb-2.5">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', online ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
              <Icon className="h-4 w-4" />
            </span>
            <span>
              {MODULE_LABELS[module.module_type] ?? titleCase(module.module_type)}
              <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                {module.module_id}
              </span>
            </span>
          </span>
          <StatusBadge tone={status.tone} label={status.label} size="sm" pulse={online} />
        </CardTitle>
        {caps.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {caps.map((c) => (
              <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {module.firmware_version && (
          <div className="text-[10px] text-muted-foreground">
            FW {module.firmware_version} · last seen {timeAgo(module.last_seen_at)}
          </div>
        )}
        <ModuleBody module={module} node={node} />
      </CardContent>
    </Card>
  )
}

function ModuleBody({
  module,
  node,
}: {
  module: NodeModule
  node: DynamicModuleGridProps['node']
}) {
  // GPS module — show current fix or "no fix" (spec §6.6 dynamic UI rules)
  if (module.module_type === 'GPS') {
    const loc = node.latest_location
    const hasFix = module.status === 'PRESENT_ONLINE' && loc && loc.source === 'GPS_MODULE'
    return (
      <div className="space-y-1.5 text-xs">
        {hasFix ? (
          <>
            <Row icon={<MapPin className="h-3 w-3" />} label="Current fix">
              <span className="font-mono text-[10px]">{formatCoord(loc!.latitude, loc!.longitude)}</span>
            </Row>
            <Row icon={<Satellite className="h-3 w-3" />} label="Accuracy">
              <span className="tabular-nums">{loc!.accuracy_m != null ? `±${loc!.accuracy_m} m` : '—'}</span>
            </Row>
            <Row icon={<Activity className="h-3 w-3" />} label="Captured">
              <span className="tabular-nums">{formatDateTime(loc!.captured_at)}</span>
            </Row>
          </>
        ) : module.status === 'PRESENT_ONLINE' ? (
          <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-warning-foreground">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>GPS detected — no current fix.</span>
          </div>
        ) : module.status === 'NOT_DETECTED' ? (
          <p className="text-muted-foreground">GPS module not detected by the node.</p>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>GPS status unknown — no valid report.</span>
          </div>
        )}
        {node.deployment_lat != null && hasFix && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-[10px] text-muted-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            <span>
              Deployment ref: {formatCoord(node.deployment_lat, node.deployment_lon)} (separate from live fix)
            </span>
          </div>
        )}
      </div>
    )
  }

  // Camera module — capture controls (mocked)
  if (module.module_type === 'CAMERA') {
    return <CameraControls module={module} />
  }

  // IMU module — motion/tilt (mocked)
  if (module.module_type === 'IMU') {
    return <ImuControls module={module} />
  }

  // Environment module — temp/humidity (mocked)
  if (module.module_type === 'ENVIRONMENT') {
    return <EnvironmentControls module={module} />
  }

  // Generic fallback for LORA, BATTERY, STORAGE, DISPLAY
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{MODULE_LABELS[module.module_type] ?? titleCase(module.module_type)} module present.</p>
      <p className="mt-0.5">No operator controls implemented for this module type in the current release.</p>
    </div>
  )
}

function CameraControls({ module }: { module: NodeModule }) {
  const online = module.status === 'PRESENT_ONLINE'

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
        <p className="font-medium">Photo capture unavailable</p>
        <p className="mt-1 text-muted-foreground">
          The current firmware/API does not implement a camera command or capture acknowledgement.
          No photo request has been sent.
        </p>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Reported module status: {online ? 'online in the stored descriptor' : module.status}.
        This status alone does not prove that a camera is connected or able to capture.
      </div>
    </div>
  )
}

function ImuControls({ module }: { module: NodeModule }) {
  const online = module.status === 'PRESENT_ONLINE'
  const sample = parseImuSample(module.last_sample_json)
  const hasSample = online && sample !== null
  const motionLabel =
    sample?.moving === true ? 'Moving' :
    sample?.moving === false ? 'Stationary' :
    'Not reported'
  const formatMg = (value: number | null) => value === null ? '—' : String(value)
  const formatDps = (value: number | null) => value === null ? '—' : (value / 10).toFixed(1)

  return (
    <div className="space-y-2 text-xs">
      <Row icon={<Activity className="h-3 w-3" />} label="Firmware motion flag">
        <span className={cn('tabular-nums', hasSample ? 'text-foreground' : 'text-muted-foreground')}>
          {hasSample ? motionLabel : 'No current sample'}
        </span>
      </Row>
      {hasSample && sample ? (
        <>
          <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Acceleration (mg)</p>
              <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
                <span>X: {formatMg(sample.acceleration_mg.x)}</span>
                <span>Y: {formatMg(sample.acceleration_mg.y)}</span>
                <span>Z: {formatMg(sample.acceleration_mg.z)}</span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Gyroscope (°/s)</p>
              <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
                <span>X: {formatDps(sample.gyro_dps10.x)}</span>
                <span>Y: {formatDps(sample.gyro_dps10.y)}</span>
                <span>Z: {formatDps(sample.gyro_dps10.z)}</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Received by dashboard: {formatDateTime(module.last_sample_received_at)}. Gyroscope firmware values are reported in 0.1°/s units and converted for display. The current telemetry payload has no source-capture timestamp.
          </p>
        </>
      ) : (
        <div className="rounded-md border border-border bg-muted/30 p-2 text-muted-foreground">
          {online
            ? 'The IMU is marked online, but no valid stored measurement sample is available.'
            : 'IMU not detected. No live readings are shown.'}
        </div>
      )}
    </div>
  )
}

function EnvironmentControls({ module }: { module: NodeModule }) {
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">
      <p className="font-medium">Live environment readings unavailable</p>
      <p className="mt-1 text-muted-foreground">
        The current gateway API does not ingest temperature, humidity or pressure samples.
        No measurements are displayed for this module.
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Stored module status: {module.status}. A reported status is not a live environmental measurement.
      </p>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-2 py-1">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

const MODULE_ICONS: Record<string, typeof Cpu> = {
  GPS: Satellite,
  CAMERA: Camera,
  IMU: Activity,
  ENVIRONMENT: Thermometer,
  LORA: Radio,
  BATTERY: Zap,
  STORAGE: Cpu,
  DISPLAY: Cpu,
}

const MODULE_LABELS: Record<string, string> = {
  GPS: 'GPS',
  CAMERA: 'Camera',
  IMU: 'IMU (Motion)',
  ENVIRONMENT: 'Environment',
  LORA: 'LoRa Radio',
  BATTERY: 'Battery Pack',
  STORAGE: 'Storage',
  DISPLAY: 'Display',
}
