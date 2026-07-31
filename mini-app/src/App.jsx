import { useEffect, useState } from 'react'
import './App.css'
import { initLenis } from './lib/lenis'
import Landing from './screens/Landing'
import Home from './screens/Home'
import Shop from './screens/Shop'
import Flights from './screens/Flights'
import Restaurants from './screens/Restaurants'
import Utilities from './screens/Utilities'

const FEATURE_SCREENS = {
  shop: Shop,
  flights: Flights,
  restaurants: Restaurants,
  utilities: Utilities,
}

function App() {
  const [screen, setScreen] = useState('landing')

  useEffect(() => {
    initLenis()
  }, [])

  if (screen === 'landing') {
    return <Landing onOpen={() => setScreen('home')} />
  }

  if (screen === 'home') {
    return <Home onSelect={setScreen} onBack={() => setScreen('landing')} />
  }

  const FeatureScreen = FEATURE_SCREENS[screen]
  return <FeatureScreen onBack={() => setScreen('home')} />
}

export default App
