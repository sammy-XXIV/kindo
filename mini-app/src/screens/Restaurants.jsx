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

// Registers the reservation (name, date, time, party) before payment, so the
// backend has what a real Resy booking would need once the NIM lands.
async function registerRestaurantOrder({ orderId, item, extraValues }) {
  const res = await fetch('/api/orders/restaurant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      priceNim: item.priceNim,
      venueId: item.id,
      venue: item.title,
      reservation: extraValues,
    }),
  })
  if (!res.ok) throw new Error('Could not register reservation')
}

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
      beforePay={registerRestaurantOrder}
    />
  )
}

export default Restaurants
