import PurchaseFlow from './PurchaseFlow'
import { fetchProducts, fetchPackages } from '../data/purchApi'

// Gift cards are delivered as codes, so the only detail we need is where to
// send the receipt (and the card itself, for brands that email it).
const RECIPIENT_FIELDS = [
  { key: 'email', label: 'Email', placeholder: 'jane@example.com', type: 'email' },
]

async function registerShopOrder({ orderId, item, extraValues }) {
  const res = await fetch('/api/orders/shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      productId: item.productId,
      packageValue: item.packageValue,
      recipientType: item.recipientType,
      priceNim: item.priceNim,
      email: extraValues.email,
    }),
  })
  if (!res.ok) throw new Error('Could not register order')
}

function Shop({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchProducts}
      expandItem={fetchPackages}
      kicker="Kindo · Shop"
      heading="Gift cards, anywhere."
      searchPlaceholder="Amazon, Steam, Spar, Roblox…"
      itemLabel="Card"
      extraFields={RECIPIENT_FIELDS}
      receiptBrandSub="SHOP"
      stampText="CARD ISSUED"
      beforePay={registerShopOrder}
    />
  )
}

export default Shop
