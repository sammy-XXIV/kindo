import PurchaseFlow from './PurchaseFlow'
import { fetchProducts } from '../data/purchApi'

const SHIPPING_FIELDS = [
  { key: 'fullName', label: 'Full name', placeholder: 'Jane Doe' },
  { key: 'addressLine1', label: 'Address', placeholder: 'Street address' },
  { key: 'addressLine2', label: 'Apt, suite, etc.', placeholder: 'Apt 4B', optional: true },
  { key: 'city', label: 'City', placeholder: 'Lagos' },
  { key: 'state', label: 'State / Province', placeholder: 'Lagos State' },
  { key: 'zip', label: 'ZIP / Postal code', placeholder: '100001' },
  { key: 'country', label: 'Country code', placeholder: 'US, NG, GB…' },
  { key: 'email', label: 'Email', placeholder: 'jane@example.com', type: 'email' },
  { key: 'phone', label: 'Phone number', placeholder: '+234 801 234 5678', type: 'tel' },
]

async function registerShopOrder({ orderId, item, extraValues }) {
  const res = await fetch('/api/orders/shop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      productUrl: item.productUrl,
      priceNim: item.priceNim,
      priceUsd: item.priceUsd,
      email: extraValues.email,
      shippingAddress: {
        name: extraValues.fullName,
        line1: extraValues.addressLine1,
        line2: extraValues.addressLine2,
        city: extraValues.city,
        state: extraValues.state,
        zip: extraValues.zip,
        country: extraValues.country,
        phone: extraValues.phone,
      },
    }),
  })
  if (!res.ok) throw new Error('Could not register order')
}

function Shop({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchProducts}
      kicker="Kindo · Shop"
      heading="What are we buying?"
      searchPlaceholder="Search for anything, or paste a link"
      itemLabel="Item"
      extraFields={SHIPPING_FIELDS}
      receiptBrandSub="SHOP"
      stampText="ORDER PLACED"
      beforePay={registerShopOrder}
    />
  )
}

export default Shop
