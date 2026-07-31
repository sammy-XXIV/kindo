import PurchaseFlow from './PurchaseFlow'
import { fetchRestaurants } from '../data/mockRestaurants'

// Matches how Resy/OpenTable actually collect a reservation: name on the
// booking, contact phone, date, time, and party size as separate fields.
const RESERVATION_FIELDS = [
  { key: 'name', label: 'Name on reservation', placeholder: 'Jane Doe' },
  { key: 'phone', label: 'Phone number', placeholder: '+234 801 234 5678', type: 'tel' },
  { key: 'date', label: 'Date', placeholder: '', type: 'date' },
  { key: 'time', label: 'Time', placeholder: '', type: 'time' },
  { key: 'partySize', label: 'Party size', placeholder: '2' },
]

function Restaurants({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchRestaurants}
      kicker="Kindo · Table"
      heading="Where are we eating?"
      searchPlaceholder="Search a restaurant or cuisine"
      itemLabel="Table"
      extraFields={RESERVATION_FIELDS}
      receiptBrandSub="TABLE"
      stampText="CONFIRMED"
    />
  )
}

export default Restaurants
