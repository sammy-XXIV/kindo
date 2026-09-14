import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RevealItem from '../components/RevealItem'
import { payWithNim, isDemoMode, payDemo } from '../lib/nimiqPay'

// Shared search → confirm → pay → receipt shape used by Shop, Flights,
// and Restaurants — only copy, mock data, and labels differ per feature.
function ImageLightbox({ src, onClose }) {
  return createPortal(
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  )
}

function SearchStep({
  kicker,
  heading,
  searchPlaceholder,
  query,
  setQuery,
  results,
  hasSearched,
  isSearching,
  searchError,
  onSearch,
  onPick,
  onExpandImage,
  onBack,
}) {
  return (
    <>
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">{kicker}</p>
        <h2>{heading}</h2>
      </header>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch()
        }}
      >
        <input
          type="text"
          className="search-input"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isSearching}
        />
        <button type="submit" className="search-submit" aria-label="Search" disabled={isSearching}>
          {isSearching ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.6" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </form>

      <div className={`product-list ${results[0]?.imageUrl ? 'product-list--store' : 'product-list--dir'}`}>
        {results.map((item) => (
          <RevealItem
            as="button"
            type="button"
            className={`product-item${item.imageUrl ? ' product-item--image' : ''}`}
            key={item.id}
            onClick={() => onPick(item)}
          >
            {item.imageUrl && (
              <span
                className="product-hero"
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation()
                  onExpandImage(item.imageUrl)
                }}
              >
                <img src={item.imageUrl} alt="" />
              </span>
            )}
            <span className="product-top">
              {!item.imageUrl && (
                <span className="product-thumb" aria-hidden="true">
                  {item.thumb}
                </span>
              )}
              <span className="product-text">
                <span className="product-title-row">
                  <span className="product-title">{item.title}</span>
                  {item.rating && (
                    <span className="product-rating" aria-hidden="true">
                      &#9733; {item.rating.toFixed(1)}
                    </span>
                  )}
                </span>
                {item.subtitle && <span className="product-subtitle">{item.subtitle}</span>}
              </span>
            </span>
            <span className="product-foot">
              <span className="product-cue">Pay in NIM</span>
              <span className="product-price">
                {item.priceNim.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                <span className="product-price-unit">NIM</span>
                <span className="product-chevron" aria-hidden="true">&rarr;</span>
              </span>
            </span>
          </RevealItem>
        ))}
        {results.length === 0 && searchError && <p className="search-error">{searchError}</p>}
        {results.length === 0 && !searchError && (
          <p className="empty-note">
            {hasSearched ? 'Nothing matched that search. Try another term.' : 'Search to see results.'}
          </p>
        )}
      </div>
    </>
  )
}

function ConfirmStep({
  item,
  itemLabel,
  extraFields,
  extraValues,
  setExtraValues,
  onPay,
  onExpandImage,
  beforePay,
  onBack,
}) {
  const [status, setStatus] = useState('idle') // idle | paying | error
  const [errorMessage, setErrorMessage] = useState('')

  const canPay = extraFields.every((f) => f.optional || extraValues[f.key]?.trim())

  async function handlePay() {
    setStatus('paying')
    setErrorMessage('')
    try {
      const orderId = `kindo-${Date.now()}`
      if (beforePay) await beforePay({ orderId, item, extraValues })
      const txHash = (await isDemoMode())
        ? await payDemo(orderId)
        : await payWithNim({ amountNim: item.priceNim, orderId })
      onPay(txHash, orderId)
    } catch (err) {
      setStatus('error')
      setErrorMessage(
        err.message === 'NIMIQ_PAY_NOT_DETECTED'
          ? "Nimiq Pay not detected — open Kindo from inside Nimiq Pay to pay."
          : err.message === 'PermissionDeniedError'
            ? 'Payment cancelled.'
            : 'Payment failed. Try again.',
      )
    }
  }

  return (
    <>
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">Confirm</p>
        <h2>{item.title}</h2>
        {item.subtitle && <p className="confirm-subtitle">{item.subtitle}</p>}
      </header>

      <div className="confirm-product">
        <span
          className="confirm-thumb"
          aria-hidden="true"
          onClick={item.imageUrl ? () => onExpandImage(item.imageUrl) : undefined}
        >
          {item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.thumb}
        </span>
      </div>

      <div className="confirm-summary">
        <div className="confirm-row">
          <span>{itemLabel}</span>
          <span>{item.title}</span>
        </div>
        {item.rating && (
          <div className="confirm-row">
            <span>Rating</span>
            <span>
              ★ {item.rating.toFixed(1)}
              {item.reviewCount ? ` (${item.reviewCount} reviews)` : ''}
            </span>
          </div>
        )}
        {item.productUrl && (
          <div className="confirm-row">
            <span>Listing</span>
            <a href={item.productUrl} target="_blank" rel="noreferrer">
              View & read reviews ↗
            </a>
          </div>
        )}
        <div className="confirm-row confirm-row--total">
          <span>Total</span>
          <span>{item.priceNim.toFixed(2)} NIM</span>
        </div>
      </div>

      {extraFields.map((f) => (
        <div className="field" key={f.key}>
          <label className="field-label" htmlFor={f.key}>
            {f.label}
            {f.optional && ' (optional)'}
          </label>
          {f.type === 'select' ? (
            <select
              id={f.key}
              className="field-input"
              value={extraValues[f.key] || ''}
              onChange={(e) => setExtraValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              <option value="" disabled>
                {f.placeholder}
              </option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={f.key}
              type={f.type || 'text'}
              className="field-input"
              placeholder={f.placeholder}
              value={extraValues[f.key] || ''}
              onChange={(e) => setExtraValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          )}
        </div>
      ))}

      {status === 'error' && <p className="pay-error">{errorMessage}</p>}

      <button
        type="button"
        className="cta cta--block"
        onClick={handlePay}
        disabled={status === 'paying' || !canPay}
      >
        {status === 'paying' ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Waiting for confirmation…
          </>
        ) : (
          `Pay ${item.priceNim.toFixed(2)} NIM`
        )}
      </button>
    </>
  )
}

// Polls the order's fulfillment after the NIM is sent, using the payment tx
// hash as the credential. Gives up after ~3 minutes without going silent.
function useDelivery(orderId, txHash) {
  const [delivery, setDelivery] = useState({ status: 'paid', codes: [] })
  useEffect(() => {
    if (!orderId || !txHash) return undefined
    let stopped = false
    let attempts = 0
    const tick = async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/orders/${orderId}/delivery?tx=${encodeURIComponent(txHash)}`)
        if (res.ok) {
          const d = await res.json()
          if (stopped) return
          setDelivery(d)
          if (d.status === 'fulfilled' || d.status === 'failed') return
        }
      } catch {
        /* transient — keep polling */
      }
      if (!stopped && attempts < 60) setTimeout(tick, 3000)
      else if (!stopped) setDelivery((d) => ({ ...d, timedOut: true }))
    }
    tick()
    return () => {
      stopped = true
    }
  }, [orderId, txHash])
  return delivery
}

function SuccessStep({ item, itemLabel, receiptBrandSub, stampText, txHash, orderId, onDone }) {
  const delivery = useDelivery(orderId, txHash)
  const done = delivery.status === 'fulfilled'
  const failed = delivery.status === 'failed'
  const statusLine = failed
    ? 'Could not complete — your NIM is safe, contact support.'
    : done
      ? delivery.codes.length
        ? 'Ready to redeem'
        : delivery.recipientType === 'email'
          ? 'Delivered to your email'
          : 'Delivered'
      : delivery.timedOut
        ? 'Still processing — check back in a minute'
        : 'Issuing…'

  return (
    <div className="success-body">
      <div className="stub">
        <div className="stub-top">
          <span className="stub-brand">KINDO</span>
          <span className="stub-brand-sub">{receiptBrandSub}</span>
        </div>
        <div className="stub-row">
          <span>{itemLabel.toUpperCase()}</span>
          <span>{item.title}</span>
        </div>
        <div className="stub-row">
          <span>PAID</span>
          <span>{item.priceNim.toFixed(2)} NIM</span>
        </div>
        {txHash && (
          <div className="stub-row">
            <span>TX</span>
            <span className="stub-tx-hash">{txHash.slice(0, 10)}&hellip;</span>
          </div>
        )}
        <div className={`stub-row stub-row--status${failed ? ' stub-row--failed' : ''}`}>
          <span>STATUS</span>
          <span>
            {!done && !failed && !delivery.timedOut && <span className="spinner spinner--inline" aria-hidden="true" />}
            {statusLine}
          </span>
        </div>
        {delivery.codes.map((c) => (
          <div className="stub-code" key={c.label + c.value}>
            <span className="stub-code-label">{c.label.replace(/_/g, ' ').toUpperCase()}</span>
            {/^https?:\/\//.test(c.value) ? (
              <a href={c.value} target="_blank" rel="noreferrer">{c.value}</a>
            ) : (
              <code>{c.value}</code>
            )}
          </div>
        ))}
        <div className="stub-perforation" aria-hidden="true" />
        <div className={`stub-stamp${done ? '' : ' stub-stamp--pending'}`}>
          <span>{failed ? 'FAILED' : done ? stampText : 'PAID'}</span>
        </div>
      </div>

      <button type="button" className="cta cta--block" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

function PurchaseFlow({
  onBack,
  fetchItems,
  kicker,
  heading,
  searchPlaceholder,
  itemLabel,
  extraFields,
  receiptBrandSub,
  stampText,
  beforePay,
}) {
  const [step, setStep] = useState('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [item, setItem] = useState(null)
  const [extraValues, setExtraValues] = useState({})
  const [txHash, setTxHash] = useState(null)
  const [orderId, setOrderId] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)

  function handleSearch() {
    setIsSearching(true)
    setSearchError('')
    fetchItems(query)
      .then((items) => {
        setResults(items)
        setHasSearched(true)
      })
      // Without this the rejection is swallowed: the spinner stops, results stay
      // empty, and the screen reads "Search to see results" as if nothing ran.
      .catch(() => {
        setResults([])
        setHasSearched(true)
        setSearchError('Search is temporarily unavailable. Try again in a moment.')
      })
      .finally(() => setIsSearching(false))
  }

  useEffect(() => {
    fetchItems('')
      .then(setResults)
      .catch(() => setResults([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      {step === 'search' && (
        <SearchStep
          kicker={kicker}
          heading={heading}
          searchPlaceholder={searchPlaceholder}
          query={query}
          setQuery={setQuery}
          results={results}
          hasSearched={hasSearched}
          isSearching={isSearching}
          searchError={searchError}
          onSearch={handleSearch}
          onPick={(p) => {
            setItem(p)
            setStep('confirm')
          }}
          onExpandImage={setLightboxImage}
          onBack={onBack}
        />
      )}

      {step === 'confirm' && item && (
        <ConfirmStep
          item={item}
          itemLabel={itemLabel}
          extraFields={extraFields}
          extraValues={extraValues}
          setExtraValues={setExtraValues}
          onPay={(hash, id) => {
            setTxHash(hash)
            setOrderId(id)
            setStep('success')
          }}
          onExpandImage={setLightboxImage}
          beforePay={beforePay}
          onBack={() => setStep('search')}
        />
      )}

      {step === 'success' && item && (
        <SuccessStep
          item={item}
          itemLabel={itemLabel}
          receiptBrandSub={receiptBrandSub}
          stampText={stampText}
          txHash={txHash}
          orderId={orderId}
          onDone={onBack}
        />
      )}

      {lightboxImage && (
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  )
}

export default PurchaseFlow
