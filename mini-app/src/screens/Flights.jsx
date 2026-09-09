import PurchaseFlow from './PurchaseFlow'
import { fetchFlights } from '../data/brijApi'

// Matches BRIJ's real booking requirement: passengers need title, legal
// given/family name, date of birth, gender, email, and phone — the same
// fields real airline booking flows ask for.
const PASSENGER_FIELDS = [
  {
    key: 'title',
    label: 'Title',
    placeholder: 'Select title',
    type: 'select',
    options: [
      { value: 'mr', label: 'Mr' },
      { value: 'mrs', label: 'Mrs' },
      { value: 'ms', label: 'Ms' },
      { value: 'miss', label: 'Miss' },
      { value: 'dr', label: 'Dr' },
    ],
  },
  { key: 'givenName', label: 'Given name', placeholder: 'Jane' },
  { key: 'familyName', label: 'Family name', placeholder: 'Doe' },
  { key: 'bornOn', label: 'Date of birth', placeholder: '', type: 'date' },
  {
    key: 'gender',
    label: 'Gender',
    placeholder: 'Select gender',
    type: 'select',
    options: [
      { value: 'm', label: 'Male' },
      { value: 'f', label: 'Female' },
    ],
  },
  { key: 'email', label: 'Email', placeholder: 'jane@example.com', type: 'email' },
  { key: 'phoneNumber', label: 'Phone number', placeholder: '+234 801 234 5678', type: 'tel' },
]

// Registers the flight order (passenger details) before payment, so the
// backend has what a real ticket issue would need once the NIM lands.
async function registerFlightOrder({ orderId, item, extraValues }) {
  const res = await fetch('/api/orders/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId,
      priceNim: item.priceNim,
      offerId: item.id,
      route: item.title,
      passenger: extraValues,
    }),
  })
  if (!res.ok) throw new Error('Could not register flight order')
}

function Flights({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchFlights}
      kicker="Kindo · Flights"
      heading="Where are we flying?"
      searchPlaceholder="e.g. LOS-LHR"
      itemLabel="Route"
      extraFields={PASSENGER_FIELDS}
      receiptBrandSub="FLIGHTS"
      stampText="BOARDING PASS"
      beforePay={registerFlightOrder}
    />
  )
}

export default Flights
