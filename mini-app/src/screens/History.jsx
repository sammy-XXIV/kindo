import { useEffect, useState } from 'react'
import RevealItem from '../components/RevealItem'
import { listOrders } from '../lib/history'
import { SuccessStep } from './PurchaseFlow'

const STATUS_LABEL = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid',
  bridging: 'Issuing',
  fulfilled: 'Delivered',
  failed: 'Failed',
}

function formatWhen(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Live status for each stored receipt, fetched with its payment tx hash.
function useStatuses(orders) {
  const [statuses, setStatuses] = useState({})
  useEffect(() => {
    let stopped = false
    orders.forEach(async (o) => {
      try {
        const res = await fetch(`/api/orders/${o.orderId}/delivery?tx=${encodeURIComponent(o.txHash)}`)
        if (!res.ok) return
        const d = await res.json()
        if (!stopped) setStatuses((s) => ({ ...s, [o.orderId]: d.status }))
      } catch {
        /* offline — leave it unknown */
      }
    })
    return () => {
      stopped = true
    }
  }, [orders])
  return statuses
}

function History({ onBack }) {
  const [orders] = useState(() => listOrders())
  const [open, setOpen] = useState(null)
  const statuses = useStatuses(orders)

  if (open) {
    return (
      <div className="page">
        <div className="home-topbar">
          <button type="button" className="text-button" onClick={() => setOpen(null)}>
            &larr; Receipts
          </button>
          <span className="wordmark">Kindo</span>
        </div>
        <SuccessStep
          item={{ title: open.title, priceNim: open.priceNim }}
          itemLabel={open.itemLabel || 'Item'}
          receiptBrandSub={open.receiptBrandSub || 'RECEIPT'}
          stampText={open.stampText || 'CONFIRMED'}
          txHash={open.txHash}
          orderId={open.orderId}
          onDone={() => setOpen(null)}
        />
      </div>
    )
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
        <p className="eyebrow">Kindo · Receipts</p>
        <h2>Everything you've paid for.</h2>
      </header>

      <div className="product-list product-list--dir">
        {orders.map((o) => {
          const status = statuses[o.orderId]
          return (
            <div className="product-entry" key={o.orderId}>
              <RevealItem as="button" type="button" className="product-item" onClick={() => setOpen(o)}>
                <span className="product-top">
                  <span className="product-thumb" aria-hidden="true">
                    {(o.subtitle || o.title || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="product-text">
                    <span className="product-title-row">
                      <span className="product-title">{o.title}</span>
                    </span>
                    <span className="product-subtitle">
                      {[o.subtitle, formatWhen(o.at)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </span>
                <span className="product-foot">
                  <span className={`product-cue hist-status${status ? ` hist-status--${status}` : ''}`}>
                    {status ? STATUS_LABEL[status] || status : '…'}
                  </span>
                  <span className="product-price">
                    {Number(o.priceNim).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    <span className="product-price-unit">NIM</span>
                    <span className="product-chevron" aria-hidden="true">&rarr;</span>
                  </span>
                </span>
              </RevealItem>
            </div>
          )
        })}
        {orders.length === 0 && <p className="empty-note">No receipts yet. They'll collect here once you pay for something.</p>}
      </div>
    </div>
  )
}

export default History
