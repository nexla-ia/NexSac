import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function getDevice() {
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

function getUTM(key) {
  try { return new URLSearchParams(window.location.search).get(key) || null }
  catch { return null }
}

// Seções rastreadas: classe CSS → chave de dado
const SECTIONS = [
  { selector: '.lp-hero',        key: 'hero',           label: 'Hero' },
  { selector: '.lp-stats',       key: 'stats',          label: 'Stats' },
  { selector: '.lp-icp',         key: 'para-quem',      label: 'Pra quem é' },
  { selector: '.lp-how',         key: 'como-funciona',  label: 'Como funciona' },
  { selector: '.lp-features',    key: 'recursos',       label: 'Recursos' },
  { selector: '.lp-team',        key: 'time',           label: 'Time' },
  { selector: '.lp-testimonial', key: 'testimonial',    label: 'Depoimento' },
  { selector: '.lp-pricing',     key: 'planos',         label: 'Planos' },
  { selector: '.lp-trial',       key: 'trial',          label: 'Trial' },
  { selector: '.lp-cta',         key: 'cta',            label: 'CTA Final' },
]

export { SECTIONS }

export function useLandingAnalytics() {
  const sessionId   = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  )
  const startTime   = useRef(Date.now())
  const scrollDepth = useRef(0)
  const ctaClicked  = useRef(false)
  const inserted    = useRef(false)
  // section key → accumulated ms
  const sectionTimes = useRef({})
  // section key → timestamp when entered viewport
  const sectionEnter = useRef({})

  useEffect(() => {
    // Insert session record
    supabase.from('landing_analytics').insert({
      session_id:   sessionId.current,
      referrer:     document.referrer || null,
      utm_source:   getUTM('utm_source'),
      utm_medium:   getUTM('utm_medium'),
      utm_campaign: getUTM('utm_campaign'),
      device:       getDevice(),
    }).then(() => { inserted.current = true })

    // Scroll depth
    function onScroll() {
      const el  = document.documentElement
      const max = el.scrollHeight - el.clientHeight
      if (max <= 0) return
      const pct = Math.round((el.scrollTop / max) * 100)
      if (pct > scrollDepth.current) scrollDepth.current = Math.min(pct, 100)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Per-section time tracking via IntersectionObserver
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const key = entry.target.dataset.analyticsSection
        if (!key) return
        if (entry.isIntersecting) {
          sectionEnter.current[key] = Date.now()
        } else if (sectionEnter.current[key]) {
          const elapsed = Date.now() - sectionEnter.current[key]
          sectionTimes.current[key] = (sectionTimes.current[key] || 0) + elapsed
          delete sectionEnter.current[key]
        }
      })
    }, { threshold: 0.3 })

    // Tag and observe each section element
    SECTIONS.forEach(({ selector, key }) => {
      const el = document.querySelector(selector)
      if (el) {
        el.dataset.analyticsSection = key
        observer.observe(el)
      }
    })

    // Flush: accumulate any currently-visible sections before saving
    function flush() {
      if (!inserted.current) return
      const now = Date.now()
      // Finalize any sections still in viewport
      Object.entries(sectionEnter.current).forEach(([key, ts]) => {
        sectionTimes.current[key] = (sectionTimes.current[key] || 0) + (now - ts)
        sectionEnter.current[key] = now // reset so next flush continues accumulating
      })
      supabase.from('landing_analytics').update({
        duration_ms:   now - startTime.current,
        scroll_depth:  scrollDepth.current,
        cta_clicked:   ctaClicked.current,
        section_times: Object.keys(sectionTimes.current).length ? sectionTimes.current : null,
        updated_at:    new Date().toISOString(),
      }).eq('session_id', sessionId.current).then(() => {})
    }

    const iv = setInterval(flush, 30_000)
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('beforeunload', flush)
      clearInterval(iv)
      observer.disconnect()
      flush()
    }
  }, [])

  function trackCTA() { ctaClicked.current = true }
  return { trackCTA }
}
