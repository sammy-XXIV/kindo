import PurchaseFlow from './PurchaseFlow'
import { fetchProducts } from '../data/purchApi'

function Shop({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchProducts}
      kicker="Kindo · Shop"
      heading="What are we buying?"
      searchPlaceholder="Search for anything, or paste a link"
      itemLabel="Item"
      extraFieldLabel="Ship to"
      extraFieldPlaceholder="Name and address"
      receiptBrandSub="SHOP"
      stampText="ORDER PLACED"
    />
  )
}

export default Shop
