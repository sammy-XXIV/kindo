import { useRef } from 'react'
import MiniStub from '../components/MiniStub'
import useScrollProgress from '../hooks/useScrollProgress'
import { SERVICES } from '../data/services'

function ServiceIsland({ service, index }) {
  const ref = useRef(null)
  const progress = useScrollProgress(ref)
  const fromRight = index % 2 === 1
  const sign = fromRight ? 1 : -1

  // Eased continuous progress: reaches "settled" a little before the
  // element is fully centered, then eases off — driven every scroll
  // frame, not toggled once by an IntersectionObserver.
  const eased = 1 - Math.pow(1 - progress, 3)
  const settle = Math.min(1, eased * 1.5)

  const translateX = sign * (1 - settle) * 70
  const rotate = sign * (4 + (1 - settle) * 14)
  const opacity = Math.min(1, eased * 1.8)
  const scale = 0.92 + settle * 0.08

  const islandStyle = {
    transform: `translateX(${translateX}px) rotate(${rotate}deg) scale(${scale})`,
    opacity,
  }

  const copyStyle = {
    transform: `translateY(${(1 - settle) * 16}px)`,
    opacity,
  }

  return (
    <div className="service-block" ref={ref}>
      <div
        className={`island service-island${fromRight ? ' island--right' : ''}`}
        style={islandStyle}
      >
        <MiniStub card={service.card} />
      </div>
      <div
        className={`service-copy${fromRight ? ' align-right' : ' align-left'}`}
        style={copyStyle}
      >
        <h3>{service.title}</h3>
        <p>{service.description}</p>
      </div>
    </div>
  )
}

function Landing({ onOpen }) {
  const receiptRef = useRef(null)
  const receiptProgress = useScrollProgress(receiptRef)
  // Gentle ambient parallax: the receipt drifts a little slower than the
  // page as it scrolls past, instead of sitting perfectly static.
  const receiptDrift = (1 - receiptProgress) * -18

  return (
    <div className="page">
      <span className="wordmark">Kindo</span>

      <main className="hero-block">
        <div className="island hero-island">
          <p className="eyebrow">Nimiq Pay mini app</p>
          <h1>
            Pay in NIM.
            <br />
            Get the receipt
            <br />
            for something real.
          </h1>
          <p className="subtitle">
            Kindo turns a NIM payment into an actual purchase, flight, or
            reservation &mdash; confirmed the moment you pay.
          </p>
          <button type="button" className="cta" onClick={onOpen}>
            Open Kindo
          </button>
        </div>

        <div
          className="island receipt-island"
          ref={receiptRef}
          style={{ transform: `translateY(${receiptDrift}px) rotate(4deg)` }}
        >
          <div className="stub">
            <div className="stub-top">
              <span className="stub-brand">KINDO</span>
              <span className="stub-brand-sub">RECEIPT</span>
            </div>
            <div className="stub-row">
              <span>FLIGHT</span>
              <span>LOS &rarr; LHR</span>
            </div>
            <div className="stub-row">
              <span>PAID</span>
              <span>42.00 NIM</span>
            </div>
            <div className="stub-perforation" aria-hidden="true" />
            <div className="stub-stamp">
              <span>CONFIRMED</span>
            </div>
          </div>
        </div>
      </main>

      <div className="scroll-hint" aria-hidden="true">
        <span>Scroll</span>
      </div>

      <section className="showcase" aria-label="What you can pay for">
        {SERVICES.map((service, index) => (
          <ServiceIsland service={service} index={index} key={service.id} />
        ))}
      </section>

      <footer className="footer">
        <span>Built on Nimiq Pay</span>
      </footer>
    </div>
  )
}

export default Landing
