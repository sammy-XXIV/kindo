import PurchaseFlow from './PurchaseFlow'
import { fetchRestaurants } from '../data/mockRestaurants'

function Restaurants({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchRestaurants}
      kicker="Kindo · Table"
      heading="Where are we eating?"
      searchPlaceholder="Search a restaurant or cuisine"
      itemLabel="Table"
      extraFieldLabel="Party & time"
      extraFieldPlaceholder="2 people, 7:30 PM"
      receiptBrandSub="TABLE"
      stampText="CONFIRMED"
    />
  )
}

export default Restaurants
