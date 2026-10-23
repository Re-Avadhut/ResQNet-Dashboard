'use client'

import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix default marker icons (Leaflet's default icon paths break with bundlers)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

;(L.Icon.Default.prototype as any)._getIconUrl = () => markerIcon
;(L.Icon.Default.prototype as any)._setIconStyles = function (img: HTMLImageElement, name: string) {
  const config: Record<string, { image: string | { src: string }; size: number[]; anchor: number[] }> = {
    icon: { image: markerIcon, size: [25, 41], anchor: [12, 41] },
    'icon-2x': { image: markerIcon2x, size: [50, 82], anchor: [25, 82] },
    shadow: { image: markerShadow, size: [41, 41], anchor: [12, 41] },
  }
  const c = config[name]
  if (!c) return
  img.src = typeof c.image === 'string' ? c.image : c.image.src
  img.style.width = `${c.size[0]}px`
  img.style.height = `${c.size[1]}px`
}

export type MapMarker = {
  id: string
  lat: number
  lng: number
  kind: 'node' | 'node_live' | 'incident' | 'survivor' | 'shelter'
  label: string
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted'
  popup?: string
}

type Props = {
  markers: MapMarker[]
  center?: [number, number]
  zoom?: number
  onMarkerClick?: (marker: MapMarker) => void
}

const TONE_COLORS: Record<string, string> = {
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#0284c7',
  muted: '#6b7280',
}

const KIND_SHAPES: Record<string, string> = {
  node: 'square',
  node_live: 'circle',
  incident: 'triangle',
  survivor: 'diamond',
  shelter: 'pentagon',
}
const DEFAULT_CENTER: [number, number] = [17.6868, 83.2185]

/**
 * Lightweight Leaflet wrapper using refs (avoids react-leaflet's strict SSR).
 */
export function LeafletMap({ markers, center = DEFAULT_CENTER, zoom = 13, onMarkerClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const groupRef = useRef<L.LayerGroup | null>(null)

  // Keep the latest onMarkerClick in a ref so the marker effect doesn't re-run.
  const onMarkerClickRef = useRef(onMarkerClick)
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick
  })

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    })
    // Spec §11.3: in a real deployment, swap for a local tile package.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    groupRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    resizeObserver.observe(containerRef.current)
    const invalidateAfterLayout = () => map.invalidateSize({ animate: false })
    window.addEventListener('resize', invalidateAfterLayout)
    const frame = requestAnimationFrame(invalidateAfterLayout)
    const delayedFrame = requestAnimationFrame(() => requestAnimationFrame(invalidateAfterLayout))

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(delayedFrame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', invalidateAfterLayout)
      map.remove()
      mapRef.current = null
      groupRef.current = null
    }
  }, [center, zoom])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }))
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Update markers when they change.
  useEffect(() => {
    const group = groupRef.current
    const map = mapRef.current
    if (!group || !map) return

    group.clearLayers()

    for (const m of markers) {
      const color = TONE_COLORS[m.tone] ?? TONE_COLORS.muted
      const icon = makeIcon(m.kind, color)
      const marker = L.marker([m.lat, m.lng], { icon }).addTo(group)
      if (m.popup) marker.bindPopup(m.popup)
      marker.on('click', () => onMarkerClickRef.current?.(m))
    }

    if (markers.length > 0 && map.getContainer().offsetParent !== null) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]))
      map.fitBounds(bounds.pad(0.1), { maxZoom: 15, animate: true })
    }
  }, [markers])

  return (
    <div
      ref={containerRef}
      // Contain Leaflet's high-z-index panes/controls inside the map stacking context.
      // Without isolation, Leaflet controls can paint over unrelated dashboard screens.
      className="relative isolate z-0 h-full w-full overflow-hidden"
      style={{ minHeight: '400px', background: 'var(--muted)', isolation: 'isolate', zIndex: 0 }}
    />
  )
}

function makeIcon(kind: string, color: string) {
  const shape = KIND_SHAPES[kind] ?? 'circle'
  const size = 22
  let svgPath = ''
  if (shape === 'square') {
    svgPath = `<rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="3" fill="${color}" stroke="#fff" stroke-width="2"/>`
  } else if (shape === 'triangle') {
    svgPath = `<polygon points="${size / 2},3 ${size - 3},${size - 3} 3,${size - 3}" fill="${color}" stroke="#fff" stroke-width="2"/>`
  } else if (shape === 'diamond') {
    svgPath = `<polygon points="${size / 2},2 ${size - 2},${size / 2} ${size / 2},${size - 2} 2,${size / 2}" fill="${color}" stroke="#fff" stroke-width="2"/>`
  } else if (shape === 'pentagon') {
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 2
    const pts: string[] = []
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
    }
    svgPath = `<polygon points="${pts.join(' ')}" fill="${color}" stroke="#fff" stroke-width="2"/>`
  } else {
    svgPath = `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="${color}" stroke="#fff" stroke-width="2"/>`
  }
  const html = `<div style="transform: translate(-50%, -50%);"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${svgPath}</svg></div>`
  return L.divIcon({ html, className: 'resqnet-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}
