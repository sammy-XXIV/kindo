import { useEffect, useState } from 'react'
import { getLenis } from '../lib/lenis'

// Continuous 0→1 progress as an element travels from the bottom of the
// viewport to its resting point, recomputed every scroll frame (not a
// one-shot IntersectionObserver trigger) so motion tracks scroll directly.
function useScrollProgress(ref) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    function update() {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      const raw = (vh - rect.top) / (vh * 0.75 + rect.height)
      setProgress(Math.min(1, Math.max(0, raw)))
    }

    update()

    const lenis = getLenis()
    if (lenis) {
      lenis.on('scroll', update)
    } else {
      window.addEventListener('scroll', update, { passive: true })
    }
    window.addEventListener('resize', update)

    return () => {
      if (lenis) lenis.off('scroll', update)
      else window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return progress
}

export default useScrollProgress
