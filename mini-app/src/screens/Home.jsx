import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getAccount, getBalanceNim, hostLocale } from '../lib/nimiqPay'

const NAV_ITEMS = [
  {
    id: 'shop',
    kicker: 'KINDO · SHOP',
    title: 'Shop',
    description: 'Amazon, Steam, Spar — gift cards, settled in NIM.',
  },
  {
    id: 'flights',
    kicker: 'KINDO · FLIGHTS',
    title: 'Flights',
    description: 'Real fares, booked on the spot.',
  },
  {
    id: 'restaurants',
    kicker: 'KINDO · TABLE',
    title: 'Dining',
    description: 'A table, locked in.',
  },
  {
    id: 'utilities',
    kicker: 'KINDO · TOP-UPS',
    title: 'Airtime & Data',
    description: 'Top up any line, instantly.',
  },
]

// Render the deck three times so the swipe wraps seamlessly: the user is kept
// parked in the MIDDLE copy, and whenever they drift into an outer copy we
// silently shift scroll by exactly one copy-width. The copies are identical,
// so the jump is invisible — the deck feels endless in both directions.
const COPIES = 3
const N = NAV_ITEMS.length
const LOOP = Array.from({ length: COPIES }, () => NAV_ITEMS).flat()

// Short form of a Nimiq address: "NQ48 VUP6 … RUX7".
function shortAddress(a) {
  const parts = String(a).split(' ')
  return parts.length >= 3 ? `${parts[0]} ${parts[1]} … ${parts[parts.length - 1]}` : a
}

function Home({ onSelect, onBack, onHistory }) {
  const trackRef = useRef(null)
  const setWidthRef = useRef(0)
  const [active, setActive] = useState(0)
  const [wallet, setWallet] = useState(null) // { address, nim } once Nimiq Pay answers

  // The wallet we're inside: its address from the SDK, balance from chain.
  useEffect(() => {
    let stopped = false
    getAccount().then(async (address) => {
      if (!address || stopped) return
      setWallet({ address, nim: null })
      try {
        const nim = await getBalanceNim(address)
        if (!stopped) setWallet({ address, nim })
      } catch {
        /* balance stays unknown; the address alone is still worth showing */
      }
    })
    return () => {
      stopped = true
    }
  }, [])

  // Width of one full copy of the deck, measured from the DOM.
  function measure() {
    const track = trackRef.current
    if (!track || track.children.length <= N) return 0
    const w = track.children[N].offsetLeft - track.children[0].offsetLeft
    setWidthRef.current = w
    return w
  }

  // Start parked at the first card of the middle copy.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const w = measure()
    if (w) track.scrollLeft = w
  }, [])

  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    const setW = setWidthRef.current || measure()
    if (!setW) return

    // Keep the scroll position inside the middle copy — a full copy of buffer
    // sits on each side, so this fires well before any real edge.
    if (track.scrollLeft < setW * 0.5) {
      track.scrollLeft += setW
    } else if (track.scrollLeft > setW * (COPIES - 0.5)) {
      track.scrollLeft -= setW
    }

    // Active dot = the card nearest the viewport centre, mapped back to 0..N-1.
    const centre = track.scrollLeft + track.clientWidth / 2
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < track.children.length; i++) {
      const card = track.children[i]
      const cardCentre = card.offsetLeft + card.offsetWidth / 2
      const dist = Math.abs(cardCentre - centre)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    const idx = best % N
    if (idx !== active) setActive(idx)
  }

  function goTo(index) {
    const track = trackRef.current
    if (!track) return
    track.children[N + index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div className="page">
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">NIM-native · no card, no account</p>
        <h2>Choose your pass.</h2>
        {wallet && (
          <p className="wallet-line">
            <span className="wallet-address">{shortAddress(wallet.address)}</span>
            {wallet.nim != null && (
              <span className="wallet-balance">
                {wallet.nim.toLocaleString(hostLocale(), { maximumFractionDigits: 2 })} <span>NIM</span>
              </span>
            )}
          </p>
        )}
      </header>

      <div className="swipe-track" ref={trackRef} onScroll={handleScroll} role="list" aria-label="Kindo services">
        {LOOP.map((item, i) => {
          const n = i % N
          return (
            <button
              type="button"
              role="listitem"
              className="pass-card"
              key={`${item.id}-${i}`}
              aria-hidden={i < N || i >= 2 * N ? 'true' : undefined}
              tabIndex={i < N || i >= 2 * N ? -1 : 0}
              onClick={() => onSelect(item.id)}
            >
              <span className="pass-index" aria-hidden="true">
                {String(n + 1).padStart(2, '0')}
              </span>
              <span className="pass-corner" aria-hidden="true" />
              <div className="pass-head">
                <span className="pass-kicker">{item.kicker}</span>
              </div>
              <div className="pass-body">
                <h3 className="pass-title">{item.title}</h3>
                <p className="pass-desc">{item.description}</p>
              </div>
              <div className="pass-foot">
                <span className="pass-serial">NO. {String(n + 1).padStart(4, '0')} / {String(N).padStart(4, '0')}</span>
                <span className="pass-cue">Tap to enter &rarr;</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="swipe-dots" role="tablist" aria-label="Service pages">
        {NAV_ITEMS.map((item, i) => (
          <button
            type="button"
            key={item.id}
            className={`swipe-dot${i === active ? ' is-active' : ''}`}
            aria-label={`Go to ${item.title}`}
            aria-selected={i === active}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <button type="button" className="home-link" onClick={onHistory}>
        Past receipts &rarr;
      </button>
    </div>
  )
}

export default Home
