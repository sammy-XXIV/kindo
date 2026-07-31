import PurchaseFlow from './PurchaseFlow'
import { fetchFlights } from '../data/brijApi'

function Flights({ onBack }) {
  return (
    <PurchaseFlow
      onBack={onBack}
      fetchItems={fetchFlights}
      kicker="Kindo · Flights"
      heading="Where are we flying?"
      searchPlaceholder="e.g. LOS-LHR"
      itemLabel="Route"
      extraFieldLabel="Passenger"
      extraFieldPlaceholder="Full name"
      receiptBrandSub="FLIGHTS"
      stampText="BOARDING PASS"
    />
  )
}

export default Flights
