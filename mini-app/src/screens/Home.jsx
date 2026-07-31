import RevealItem from '../components/RevealItem'

const NAV_ITEMS = [
  {
    id: 'shop',
    kicker: 'KINDO · SHOP',
    title: 'Shop',
    description: 'Search for anything, or paste a link.',
  },
  {
    id: 'flights',
    kicker: 'KINDO · FLIGHTS',
    title: 'Flights',
    description: 'Search real fares, book on the spot.',
  },
  {
    id: 'restaurants',
    kicker: 'KINDO · TABLE',
    title: 'Restaurants',
    description: 'Find a table, lock in the reservation.',
  },
  {
    id: 'utilities',
    kicker: 'KINDO · RATES',
    title: 'Utilities',
    description: 'Weather, rates, and translation.',
  },
]

function Home({ onSelect, onBack }) {
  return (
    <div className="page">
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">What are we doing today?</p>
        <h2>Pick something to pay for.</h2>
      </header>

      <nav className="nav-list" aria-label="Kindo services">
        {NAV_ITEMS.map((item) => (
          <RevealItem
            as="button"
            type="button"
            className="nav-card"
            key={item.id}
            onClick={() => onSelect(item.id)}
          >
            <div className="nav-card-text">
              <span className="nav-card-kicker">{item.kicker}</span>
              <span className="nav-card-title">{item.title}</span>
              <span className="nav-card-desc">{item.description}</span>
            </div>
            <span className="nav-card-arrow" aria-hidden="true">
              &rarr;
            </span>
          </RevealItem>
        ))}
      </nav>
    </div>
  )
}

export default Home
