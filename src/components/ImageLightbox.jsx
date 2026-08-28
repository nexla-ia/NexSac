import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, Download, RotateCcw, RotateCw, RefreshCw } from 'lucide-react'

// Visualizador de imagem em tela cheia COM zoom e rotação.
// - Botões + / − · scroll do mouse · duplo-clique · arrastar pra mover (mãozinha)
// - Girar à esquerda/direita 90° (pra fotos que chegam deitadas ou de cabeça pra baixo)
// - Pinça de dois dedos no celular · teclas + − 0 R Esc · botão Baixar
const MIN = 1, MAX = 6
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export default function ImageLightbox({ src, alt = 'imagem', onClose, download = 'imagem.jpg' }) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)   // graus, múltiplos de 90
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef(null)             // { startX, startY, baseX, baseY }
  const pointers = useRef(new Map())    // pointerId → {x,y} (pra pinça)
  const pinch = useRef(null)            // { dist, baseScale }
  const [grabbing, setGrabbing] = useState(false)

  // Dá pra arrastar quando está ampliado OU girado de lado (aí a foto costuma
  // passar da tela e a pessoa precisa reposicionar com a mãozinha).
  const canPan = scale > 1 || rotation % 180 !== 0

  const reset = useCallback(() => { setScale(1); setRotation(0); setPos({ x: 0, y: 0 }) }, [])
  const isReset = scale === 1 && rotation === 0 && pos.x === 0 && pos.y === 0
  const zoomBy = useCallback((delta) => {
    setScale(prev => {
      const next = clamp(+(prev + delta).toFixed(2), MIN, MAX)
      if (next === 1) setPos({ x: 0, y: 0 })
      return next
    })
  }, [])
  // Gira em passos de 90° e recentraliza (pra não jogar a foto pra fora da tela).
  const rotateBy = useCallback((deg) => {
    setRotation(prev => ((prev + deg) % 360 + 360) % 360)
    setPos({ x: 0, y: 0 })
  }, [])

  // Reseta ao trocar de imagem
  useEffect(() => { reset() }, [src, reset])

  // Teclado
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose?.()
      else if (e.key === '+' || e.key === '=') zoomBy(0.4)
      else if (e.key === '-' || e.key === '_') zoomBy(-0.4)
      else if (e.key === '0') reset()
      else if (e.key === 'r' || e.key === 'R') rotateBy(90)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, zoomBy, reset, rotateBy])

  const onWheel = e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.3 : -0.3) }

  const onPointerDown = e => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, baseScale: scale }
      drag.current = null; setGrabbing(false)
    } else if (canPan) {
      drag.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
      setGrabbing(true)
    }
  }
  const onPointerMove = e => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const next = clamp(+(pinch.current.baseScale * (dist / pinch.current.dist)).toFixed(2), MIN, MAX)
      setScale(next); if (next === 1) setPos({ x: 0, y: 0 })
      return
    }
    if (drag.current) {
      setPos({ x: drag.current.baseX + (e.clientX - drag.current.startX), y: drag.current.baseY + (e.clientY - drag.current.startY) })
    }
  }
  const endPointer = e => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) { drag.current = null; setGrabbing(false) }
  }

  const ctrlBtn = (extra = {}) => ({
    width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
    transition: 'background 0.12s', ...extra,
  })

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget && !drag.current) onClose?.() }}
      onWheel={onWheel}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, overflow: 'hidden', touchAction: 'none' }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        onPointerDown={onPointerDown}
        style={{
          maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 10,
          transform: `translate(${pos.x}px, ${pos.y}px) rotate(${rotation}deg) scale(${scale})`,
          transition: drag.current || pinch.current ? 'none' : 'transform 0.14s ease',
          transformOrigin: 'center center',
          cursor: canPan ? (grabbing ? 'grabbing' : 'grab') : 'zoom-in',
          userSelect: 'none', WebkitUserSelect: 'none', boxShadow: '0 8px 50px rgba(0,0,0,0.55)',
        }}
      />

      {/* Barra de controles */}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 24px)',
        background: 'rgba(20,20,22,0.7)', border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 24, padding: 6, backdropFilter: 'blur(8px)', boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      }}>
        <button onClick={() => zoomBy(-0.4)} disabled={scale <= MIN} title="Menos zoom (−)"
          style={ctrlBtn({ opacity: scale <= MIN ? 0.4 : 1, cursor: scale <= MIN ? 'default' : 'pointer' })}><ZoomOut size={18} /></button>
        <span style={{ color: '#fff', fontSize: 12.5, fontWeight: 700, minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => zoomBy(0.4)} disabled={scale >= MAX} title="Mais zoom (+)"
          style={ctrlBtn({ opacity: scale >= MAX ? 0.4 : 1, cursor: scale >= MAX ? 'default' : 'pointer' })}><ZoomIn size={18} /></button>
        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
        <button onClick={() => rotateBy(-90)} title="Girar à esquerda"
          style={ctrlBtn()}><RotateCcw size={17} /></button>
        <button onClick={() => rotateBy(90)} title="Girar à direita (R)"
          style={ctrlBtn()}><RotateCw size={17} /></button>
        <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />
        <button onClick={reset} disabled={isReset} title="Restaurar (0)"
          style={ctrlBtn({ opacity: isReset ? 0.4 : 1, cursor: isReset ? 'default' : 'pointer' })}><RefreshCw size={16} /></button>
        <a href={src} download={download} onClick={e => e.stopPropagation()} title="Baixar" style={ctrlBtn()}><Download size={17} /></a>
      </div>

      {/* Fechar */}
      <button onClick={onClose} title="Fechar (Esc)" style={{
        position: 'fixed', top: 16, right: 16, width: 42, height: 42, borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(20,20,22,0.6)', color: '#fff',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)',
      }}><X size={22} /></button>
    </div>,
    document.body
  )
}
