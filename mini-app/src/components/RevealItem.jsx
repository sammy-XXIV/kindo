import { useRef } from 'react'
import useScrollProgress from '../hooks/useScrollProgress'

// Continuous scroll-linked reveal for list items (nav cards, results,
// tool menus) — same motion language as the landing page, factored out
// so every list in the app animates in consistently.
function RevealItem({ as: Component = 'div', className = '', style, ...props }) {
  const ref = useRef(null)
  const progress = useScrollProgress(ref)
  const eased = 1 - Math.pow(1 - progress, 3)
  const settle = Math.min(1, eased * 1.6)

  const revealStyle = {
    opacity: settle,
    transform: `translateY(${(1 - settle) * 28}px)`,
    ...style,
  }

  return <Component ref={ref} className={className} style={revealStyle} {...props} />
}

export default RevealItem
