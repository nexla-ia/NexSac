import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Eye, Clock, TrendingUp, MousePointerClick, Smartphone, Monitor, Tablet,
  Globe, RefreshCw, ArrowUpRight, Activity, Zap, ChevronRight, LayoutList,
} from 'lucide-react'
import { SECTIONS } from '../../hooks/useLandingAnalytics'
import './AdmLanding.css'

/* ── helpers ──────────────────────────────────────────────────────────────── */
function fmtDuration(ms) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60 < 10 ? '0' : ''}${s % 60}s`
}

function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now - d
  if (diffMs < 60_000) return 'agora'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}min atrás`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function parseReferrer(ref) {
  if (!ref) return 'Direto'
  try {
    const host = new URL(ref).hostname.replace('www.', '')
    if (host.includes('google'))    return 'Google'
    if (host.includes('instagram')) return 'Instagram'
    if (host.includes('facebook'))  return 'Facebook'
    if (host.includes('whatsapp'))  return 'WhatsApp'
    if (host.includes('linkedin'))  return 'LinkedIn'
    if (host.includes('youtube'))   return 'YouTube'
    return host
  } catch { return 'Direto' }
}

function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x }
function addDays(d, n)  { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/* ── Sparkline SVG ────────────────────────────────────────────────────────── */
function Sparkline({ data, color = '#4F46E5', height = 48, fill = true }) {
  if (!data.length) return <div style={{ height }} />
  const max = Math.max(...data, 1)
  const W = 220, H = height
  const pts = data.map((v, i) => [
    (i / (data.length - 1 || 1)) * W,
    H - (v / max) * (H - 6) - 3,
  ])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {fill && (
        <path d={area} fill={color} opacity={0.12} />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ── Bar ──────────────────────────────────────────────────────────────────── */
function MiniBar({ pct, color }) {
  return (
    <div className="al-bar-track">
      <div className="al-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function AdmLanding() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [range, setRange]       = useState('7d')
  const [refreshAt, setRefreshAt] = useState(Date.now())
  const [liveFlash, setLiveFlash] = useState(false)

  async function load() {
    setLoading(true)
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const { data } = await supabase
      .from('landing_analytics')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [range, refreshAt])

  // Realtime: insert → prepend; update → merge in-place
  useEffect(() => {
    const ch = supabase.channel('adm-landing-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'landing_analytics' }, ({ new: row }) => {
        setRows(prev => [row, ...prev])
        setLiveFlash(true)
        setTimeout(() => setLiveFlash(false), 1200)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'landing_analytics' }, ({ new: row }) => {
        setRows(prev => prev.map(r => r.id === row.id ? row : r))
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  /* ── derived ── */
  const stats = useMemo(() => {
    const total    = rows.length
    const withDur  = rows.filter(r => r.duration_ms > 0)
    const bounced  = rows.filter(r => !r.duration_ms || r.duration_ms < 30_000)
    const avgDur   = withDur.length
      ? withDur.reduce((s, r) => s + r.duration_ms, 0) / withDur.length : 0
    const ctaPct   = total
      ? Math.round((rows.filter(r => r.cta_clicked).length / total) * 100) : 0
    const bouncePct = total ? Math.round((bounced.length / total) * 100) : 0
    return { total, avgDur, ctaPct, bouncePct }
  }, [rows])

  // Visits per day (last N days)
  const timelineData = useMemo(() => {
    const days = range === '24h' ? 24 : range === '7d' ? 7 : 30
    const buckets = Array.from({ length: days }, (_, i) => {
      if (range === '24h') {
        const h = new Date(); h.setMinutes(0,0,0); h.setHours(h.getHours() - (days - 1 - i))
        return { label: `${h.getHours()}h`, from: h, count: 0 }
      }
      const d = startOfDay(addDays(new Date(), i - days + 1))
      return { label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), from: d, count: 0 }
    })
    rows.forEach(r => {
      const d = new Date(r.created_at)
      for (let i = buckets.length - 1; i >= 0; i--) {
        if (d >= buckets[i].from) { buckets[i].count++; break }
      }
    })
    return buckets
  }, [rows, range])

  // Sources
  const sources = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      const k = r.utm_source ? `utm:${r.utm_source}` : parseReferrer(r.referrer)
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => ({ label: k.replace('utm:', ''), count: v, pct: Math.round((v / rows.length) * 100) }))
  }, [rows])

  // Devices
  const devices = useMemo(() => {
    const map = { mobile: 0, tablet: 0, desktop: 0 }
    rows.forEach(r => { if (r.device && map[r.device] !== undefined) map[r.device]++ })
    const total = Object.values(map).reduce((a, b) => a + b, 1)
    return [
      { label: 'Mobile',  icon: Smartphone, count: map.mobile,  pct: Math.round(map.mobile  / total * 100), color: '#4F46E5' },
      { label: 'Desktop', icon: Monitor,    count: map.desktop, pct: Math.round(map.desktop / total * 100), color: '#10B981' },
      { label: 'Tablet',  icon: Tablet,     count: map.tablet,  pct: Math.round(map.tablet  / total * 100), color: '#F59E0B' },
    ]
  }, [rows])

  // Scroll funnel (estimate from scroll_depth)
  const funnel = useMemo(() => {
    const total = rows.length || 1
    const thresholds = [
      { label: 'Hero',    min: 1,  color: '#4F46E5' },
      { label: 'Stats',   min: 15, color: '#6366F1' },
      { label: 'Recursos',min: 35, color: '#8B5CF6' },
      { label: 'Planos',  min: 60, color: '#A78BFA' },
      { label: 'CTA',     min: 85, color: '#C4B5FD' },
    ]
    return thresholds.map(t => ({
      ...t,
      count: rows.filter(r => (r.scroll_depth || 0) >= t.min).length,
      pct:   Math.round(rows.filter(r => (r.scroll_depth || 0) >= t.min).length / total * 100),
    }))
  }, [rows])

  const maxTimeline = Math.max(...timelineData.map(b => b.count), 1)

  // Per-section average time
  const sectionStats = useMemo(() => {
    const rowsWithSections = rows.filter(r => r.section_times && typeof r.section_times === 'object')
    if (!rowsWithSections.length) return []
    return SECTIONS.map(({ key, label }) => {
      const times = rowsWithSections.map(r => r.section_times[key] || 0).filter(v => v > 0)
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
      return { key, label, avg, sessions: times.length }
    }).sort((a, b) => b.avg - a.avg)
  }, [rows])

  // Duration distribution buckets
  const durBuckets = useMemo(() => {
    const buckets = [
      { label: '< 30s',    max: 30_000,   color: '#EF4444' },
      { label: '30s–2min', max: 120_000,  color: '#F59E0B' },
      { label: '2–5min',   max: 300_000,  color: '#4F46E5' },
      { label: '5–10min',  max: 600_000,  color: '#10B981' },
      { label: '> 10min',  max: Infinity, color: '#059669' },
    ]
    const counted = buckets.map((b, i) => {
      const min = i === 0 ? 0 : buckets[i - 1].max
      const count = rows.filter(r => {
        const d = r.duration_ms || 0
        return d >= min && d < b.max
      }).length
      return { ...b, count }
    })
    const maxCount = Math.max(...counted.map(b => b.count), 1)
    return counted.map(b => ({ ...b, pct: Math.round((b.count / (rows.length || 1)) * 100), barPct: Math.round((b.count / maxCount) * 100) }))
  }, [rows])

  /* ── render ── */
  return (
    <div className="al">
      {/* HEADER */}
      <div className="al-header">
        <div className="al-header-left">
          <div className={`al-live-dot ${liveFlash ? 'flash' : ''}`} />
          <div>
            <h1 className="al-title">Pulso da Landing</h1>
            <p className="al-sub">Visitantes, engajamento e conversões em tempo real</p>
          </div>
        </div>
        <div className="al-header-right">
          <div className="al-range-group">
            {['24h','7d','30d'].map(r => (
              <button key={r} className={`al-range-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
                {r}
              </button>
            ))}
          </div>
          <button className="al-refresh" onClick={() => setRefreshAt(Date.now())} title="Atualizar">
            <RefreshCw size={14} className={loading ? 'al-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="al-kpi-row">
        <KpiCard
          icon={<Eye size={18} />}
          label="Sessões totais"
          value={stats.total.toLocaleString('pt-BR')}
          sub={`período selecionado`}
          accent="#4F46E5"
          chart={<Sparkline data={timelineData.map(b => b.count)} color="#4F46E5" />}
        />
        <KpiCard
          icon={<Clock size={18} />}
          label="Tempo médio"
          value={fmtDuration(stats.avgDur)}
          sub={`meta: acima de 2min`}
          accent="#10B981"
          good={stats.avgDur > 120_000}
        />
        <KpiCard
          icon={<TrendingUp size={18} />}
          label="Taxa de bounce"
          value={`${stats.bouncePct}%`}
          sub={`saiu em < 30s`}
          accent={stats.bouncePct > 60 ? '#EF4444' : '#F59E0B'}
          bad={stats.bouncePct > 60}
        />
        <KpiCard
          icon={<MousePointerClick size={18} />}
          label="Clicaram no CTA"
          value={`${stats.ctaPct}%`}
          sub={`acionaram botão`}
          accent="#10B981"
          good={stats.ctaPct > 5}
        />
      </div>

      {/* DURATION DISTRIBUTION */}
      <div className="al-card al-dur-card">
        <div className="al-card-head">
          <Clock size={15} />
          <span>Tempo por sessão</span>
          <span className="al-dur-avg-badge">
            Média: <strong>{fmtDuration(stats.avgDur)}</strong>
          </span>
        </div>
        <div className="al-dur-grid">
          {durBuckets.map(b => (
            <div key={b.label} className="al-dur-bucket">
              <div className="al-dur-bar-wrap">
                <div className="al-dur-bar" style={{ height: `${b.barPct}%`, background: b.color }} />
              </div>
              <div className="al-dur-count" style={{ color: b.color }}>{b.count}</div>
              <div className="al-dur-label">{b.label}</div>
              <div className="al-dur-pct">{b.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION TIMES */}
      <div className="al-card al-sections-time-card">
        <div className="al-card-head">
          <LayoutList size={15} />
          <span>Tempo médio por seção</span>
          <span className="al-dur-avg-badge">
            {sectionStats.filter(s => s.sessions > 0).length} seções com dados
          </span>
        </div>
        {sectionStats.filter(s => s.sessions > 0).length === 0 ? (
          <div className="al-empty">Ainda sem dados — o tracking acumula à medida que visitantes rolam a página.</div>
        ) : (
          <div className="al-section-rows">
            {(() => {
              const maxAvg = Math.max(...sectionStats.map(s => s.avg), 1)
              // Show in page order (not sorted by time)
              const ordered = SECTIONS.map(({ key, label }) => sectionStats.find(s => s.key === key) || { key, label, avg: 0, sessions: 0 })
              return ordered.map((s, i) => {
                const barPct = Math.round((s.avg / maxAvg) * 100)
                const hue = s.avg > 120_000 ? '#059669' : s.avg > 60_000 ? '#10B981' : s.avg > 30_000 ? '#4F46E5' : s.avg > 10_000 ? '#F59E0B' : '#94A3B8'
                return (
                  <div key={s.key} className="al-section-row">
                    <span className="al-section-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="al-section-name">{s.label}</span>
                    <div className="al-section-bar-wrap">
                      <div className="al-section-bar" style={{ width: `${barPct}%`, background: hue }} />
                    </div>
                    <span className="al-section-time" style={{ color: hue }}>
                      {s.avg > 0 ? fmtDuration(s.avg) : '—'}
                    </span>
                    <span className="al-section-sessions">{s.sessions > 0 ? `${s.sessions} sess.` : ''}</span>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* TIMELINE + DEVICES */}
      <div className="al-mid-row">

        {/* Timeline */}
        <div className="al-card al-timeline-card">
          <div className="al-card-head">
            <Activity size={15} />
            <span>Visitas por {range === '24h' ? 'hora' : 'dia'}</span>
          </div>
          <div className="al-timeline-chart">
            <Sparkline data={timelineData.map(b => b.count)} color="#4F46E5" height={80} />
            <div className="al-timeline-labels">
              {timelineData.filter((_, i) => {
                const step = timelineData.length <= 8 ? 1 : timelineData.length <= 14 ? 2 : 5
                return i % step === 0 || i === timelineData.length - 1
              }).map((b, i) => (
                <span key={i}>{b.label}</span>
              ))}
            </div>
            <div className="al-timeline-bars">
              {timelineData.map((b, i) => (
                <div
                  key={i}
                  className="al-tbar"
                  style={{ '--h': `${(b.count / maxTimeline) * 100}%` }}
                  title={`${b.label}: ${b.count} visitas`}
                />
              ))}
            </div>
          </div>
          <div className="al-timeline-peak">
            Pico: <strong>{Math.max(...timelineData.map(b => b.count))} visitas</strong>
            {' · '}Média: <strong>{Math.round(timelineData.reduce((s,b) => s+b.count,0) / (timelineData.length||1))}/dia</strong>
          </div>
        </div>

        {/* Devices */}
        <div className="al-card al-devices-card">
          <div className="al-card-head">
            <Smartphone size={15} />
            <span>Dispositivos</span>
          </div>
          <div className="al-devices-list">
            {devices.map(d => (
              <div key={d.label} className="al-device-row">
                <div className="al-device-icon" style={{ color: d.color, background: `${d.color}18` }}>
                  <d.icon size={14} />
                </div>
                <div className="al-device-info">
                  <div className="al-device-label">{d.label}</div>
                  <MiniBar pct={d.pct} color={d.color} />
                </div>
                <div className="al-device-pct" style={{ color: d.color }}>{d.pct}%</div>
              </div>
            ))}
          </div>
          <div className="al-devices-donut">
            <DonutChart slices={devices.map(d => ({ pct: d.pct, color: d.color, label: d.label }))} />
          </div>
        </div>
      </div>

      {/* SOURCES + FUNNEL */}
      <div className="al-bottom-row">

        {/* Sources */}
        <div className="al-card al-sources-card">
          <div className="al-card-head">
            <Globe size={15} />
            <span>Origens de tráfego</span>
          </div>
          {sources.length === 0 ? (
            <div className="al-empty">Nenhuma sessão registrada ainda</div>
          ) : (
            <div className="al-sources-list">
              {sources.map((s, i) => (
                <div key={s.label} className="al-source-row">
                  <span className="al-source-rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="al-source-label">{s.label}</span>
                  <MiniBar pct={s.pct} color="#4F46E5" />
                  <span className="al-source-count">{s.count}</span>
                  <span className="al-source-pct">{s.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Funnel */}
        <div className="al-card al-funnel-card">
          <div className="al-card-head">
            <Zap size={15} />
            <span>Funil de scroll</span>
          </div>
          <div className="al-funnel-list">
            {funnel.map((f, i) => (
              <div key={f.label} className="al-funnel-row">
                <div className="al-funnel-label">
                  <span className="al-funnel-step">{f.label}</span>
                  <span className="al-funnel-count">{f.count}</span>
                </div>
                <div className="al-funnel-bar-wrap">
                  <div className="al-funnel-bar" style={{ width: `${f.pct}%`, background: f.color }} />
                  {i > 0 && funnel[i-1].count > 0 && (
                    <span className="al-funnel-drop">
                      -{Math.round((1 - f.count / (funnel[i-1].count || 1)) * 100)}%
                    </span>
                  )}
                </div>
                <span className="al-funnel-pct" style={{ color: f.color }}>{f.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SESSIONS FEED */}
      <div className="al-card al-sessions-card">
        <div className="al-card-head">
          <Activity size={15} />
          <span>Sessões recentes</span>
          <span className="al-sessions-badge">{rows.length} no período</span>
        </div>
        <div className="al-sessions-table">
          <div className="al-sessions-head">
            <span>Dispositivo</span>
            <span>Duração</span>
            <span>Scroll</span>
            <span>Origem</span>
            <span>CTA</span>
            <span>Quando</span>
          </div>
          {rows.length === 0 ? (
            <div className="al-empty al-empty-sessions">
              <Eye size={28} strokeWidth={1.2} />
              <p>Nenhuma sessão registrada ainda.<br />
              <strong>A tabela precisa existir no Supabase</strong> — rode a migration ou crie via dashboard.</p>
            </div>
          ) : (
            rows.slice(0, 50).map(r => (
              <SessionRow key={r.id} r={r} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────────────── */
function KpiCard({ icon, label, value, sub, accent, chart, good, bad }) {
  return (
    <div className={`al-kpi ${good ? 'kpi-good' : bad ? 'kpi-bad' : ''}`} style={{ '--accent': accent }}>
      <div className="al-kpi-top">
        <span className="al-kpi-icon">{icon}</span>
        <span className="al-kpi-label">{label}</span>
      </div>
      <div className="al-kpi-value">{value}</div>
      <div className="al-kpi-sub">{sub}</div>
      {chart && <div className="al-kpi-chart">{chart}</div>}
    </div>
  )
}

function SessionRow({ r }) {
  const DevIcon = r.device === 'mobile' ? Smartphone : r.device === 'tablet' ? Tablet : Monitor
  const devColor = r.device === 'mobile' ? '#4F46E5' : r.device === 'tablet' ? '#F59E0B' : '#10B981'
  const durMs = r.duration_ms || 0
  const engaged = durMs > 120_000
  const bounced = durMs < 30_000 || !r.duration_ms

  return (
    <div className={`al-session-row ${bounced ? 'bounce' : engaged ? 'engaged' : ''}`}>
      <span className="al-sess-device">
        <DevIcon size={13} color={devColor} />
        <span style={{ color: devColor }}>{r.device || '?'}</span>
      </span>
      <span className="al-sess-dur">{fmtDuration(r.duration_ms)}</span>
      <span className="al-sess-scroll">
        <div className="al-sess-scroll-bar">
          <div style={{ width: `${r.scroll_depth || 0}%`, background: '#4F46E5' }} />
        </div>
        <span>{r.scroll_depth || 0}%</span>
      </span>
      <span className="al-sess-ref">{parseReferrer(r.referrer)}</span>
      <span className={`al-sess-cta ${r.cta_clicked ? 'yes' : 'no'}`}>
        {r.cta_clicked ? '✓ Sim' : '—'}
      </span>
      <span className="al-sess-time">{fmtTime(r.created_at)}</span>
    </div>
  )
}

function DonutChart({ slices }) {
  const R = 36, cx = 44, cy = 44, stroke = 10
  const valid = slices.filter(s => s.pct > 0)
  if (!valid.length) return null
  let offset = 0
  const circ = 2 * Math.PI * R
  return (
    <svg width={88} height={88} viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
      {valid.map((s, i) => {
        const dash = (s.pct / 100) * circ
        const gap  = circ - dash
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        )
        offset += dash
        return el
      })}
    </svg>
  )
}
