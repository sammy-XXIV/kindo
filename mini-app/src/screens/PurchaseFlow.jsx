import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import RevealItem from '../components/RevealItem'
import { payWithNim } from '../lib/nimiqPay'

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
        />
        <button type="submit" className="search-submit">
          Search
        </button>
      </form>

      <div className="product-list">
        {results.map((item) => (
          <RevealItem
            as="button"
            type="button"
            className="product-item"
            key={item.id}
            onClick={() => onPick(item)}
          >
            <span
              className="product-thumb"
              aria-hidden="true"
              onClick={
                item.imageUrl
                  ? (e) => {
                      e.stopPropagation()
                      onExpandImage(item.imageUrl)
                    }
                  : undefined
              }
            >
              {item.imageUrl ? <img src={item.imageUrl} alt="" /> : item.thumb}
            </span>
            <span className="product-text">
              <span className="product-title">{item.title}</span>
              {(item.subtitle || item.rating) && (
                <span className="product-subtitle">
                  {item.subtitle}
                  {item.subtitle && item.rating ? ' · ' : ''}
                  {item.rating && `★ ${item.rating.toFixed(1)}${item.reviewCount ? ` (${item.reviewCount})` : ''}`}
                </span>
              )}
              <span className="product-price">{item.priceNim.toFixed(2)} NIM</span>
            </span>
          </RevealItem>
        ))}
        {results.length === 0 && (
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
      const txHash = await payWithNim({ amountNim: item.priceNim, orderId })
      onPay(txHash)
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
        {status === 'paying' ? 'Waiting for confirmation…' : `Pay ${item.priceNim.toFixed(2)} NIM`}
      </button>
    </>
  )
}

function SuccessStep({ item, itemLabel, receiptBrandSub, stampText, txHash, onDone }) {
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
        <div className="stub-perforation" aria-hidden="true" />
        <div className="stub-stamp">
          <span>{stampText}</span>
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
  const [item, setItem] = useState(null)
  const [extraValues, setExtraValues] = useState({})
  const [txHash, setTxHash] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)

  function handleSearch() {
    fetchItems(query).then((items) => {
      setResults(items)
      setHasSearched(true)
    })
  }

  useEffect(() => {
    fetchItems('').then(setResults)
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
          onPay={(hash) => {
            setTxHash(hash)
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
