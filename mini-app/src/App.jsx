import { useEffect, useState } from 'react'
import './App.css'
import { initLenis } from './lib/lenis'
import ErrorBoundary from './components/ErrorBoundary'
import Landing from './screens/Landing'
import Home from './screens/Home'
import Shop from './screens/Shop'
import Flights from './screens/Flights'
import Restaurants from './screens/Restaurants'
import Utilities from './screens/Utilities'
import History from './screens/History'
import { loadScreen, saveScreen } from './lib/history'

const FEATURE_SCREENS = {
  shop: Shop,
  flights: Flights,
  restaurants: Restaurants,
  utilities: Utilities,
  history: History,
}

function App() {
  // Reopen where the user left off (a refresh shouldn't bounce to the landing page).
  const [screen, setScreen] = useState(() => {
    const saved = loadScreen()
    return saved && (saved === 'home' || FEATURE_SCREENS[saved]) ? saved : 'landing'
  })

  useEffect(() => {
    initLenis()
  }, [])

  useEffect(() => {
    saveScreen(screen)
  }, [screen])

  let content
  if (screen === 'landing') {
    content = <Landing onOpen={() => setScreen('home')} />
  } else if (screen === 'home') {
    content = <Home onSelect={setScreen} onBack={() => setScreen('landing')} onHistory={() => setScreen('history')} />
  } else {
    const FeatureScreen = FEATURE_SCREENS[screen]
    content = <FeatureScreen onBack={() => setScreen('home')} />
  }
  return <ErrorBoundary key={screen}>{content}</ErrorBoundary>
}

export default App
