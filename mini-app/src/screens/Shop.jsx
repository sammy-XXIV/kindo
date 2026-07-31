import PurchaseFlow from './PurchaseFlow'
import { fetchProducts } from '../data/purchApi'

const SHIPPING_FIELDS = [
  { key: 'fullName', label: 'Full name', placeholder: 'Jane Doe' },
  { key: 'addressLine1', label: 'Address', placeholder: 'Street address' },
  { key: 'addressLine2', label: 'Apt, suite, etc.', placeholder: 'Apt 4B', optional: true },
  { key: 'city', label: 'City', placeholder: 'Lagos' },
  { key: 'state', label: 'State / Province', placeholder: 'Lagos State' },
  { key: 'zip', label: 'ZIP / Postal code', placeholder: '100001' },
  { key: 'country', label: 'Country', placeholder: 'Nigeria' },
  { key: 'phone', label: 'Phone number', placeholder: '+234 801 234 5678', type: 'tel' },
]

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
    />
  )
}

export default Shop
