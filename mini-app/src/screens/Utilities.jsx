import { useState } from 'react'
import RevealItem from '../components/RevealItem'
import PurchaseFlow from './PurchaseFlow'
import { convertCurrency, getWeather, translateText } from '../data/mockUtilities'
import { fetchTopups } from '../data/bitrefillApi'

const TOOLS = [
  { id: 'weather', title: 'Weather', description: 'Check any city, live.' },
  { id: 'currency', title: 'Currency', description: 'Convert between currencies.' },
  { id: 'translate', title: 'Translate', description: 'Translate any text.' },
  { id: 'mobile-data', title: 'Mobile Data', description: 'Top up any phone, anywhere.' },
]

function Menu({ onPick, onBack }) {
  return (
    <>
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">Kindo · Utilities</p>
        <h2>What do you need to know?</h2>
      </header>

      <nav className="nav-list" aria-label="Kindo utilities">
        {TOOLS.map((tool) => (
          <RevealItem
            as="button"
            type="button"
            className="nav-card"
            key={tool.id}
            onClick={() => onPick(tool.id)}
          >
            <div className="nav-card-text">
              <span className="nav-card-kicker">KINDO · {tool.title.toUpperCase()}</span>
              <span className="nav-card-title">{tool.title}</span>
              <span className="nav-card-desc">{tool.description}</span>
            </div>
            <span className="nav-card-arrow" aria-hidden="true">
              &rarr;
            </span>
          </RevealItem>
        ))}
      </nav>
    </>
  )
}

function WeatherForm({ onSubmit, onBack }) {
  const [city, setCity] = useState('')
  return (
    <ToolForm
      title="Weather"
      onBack={onBack}
      onSubmit={() => onSubmit(getWeather(city))}
    >
      <input
        type="text"
        className="field-input"
        placeholder="City, e.g. Lagos"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />
    </ToolForm>
  )
}

function CurrencyForm({ onSubmit, onBack }) {
  const [amount, setAmount] = useState('100')
  const [from, setFrom] = useState('USD')
  const [to, setTo] = useState('EUR')
  return (
    <ToolForm
      title="Currency"
      onBack={onBack}
      onSubmit={() => onSubmit(convertCurrency(amount, from, to))}
    >
      <input
        type="number"
        className="field-input"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <div className="field-row">
        <input
          type="text"
          className="field-input"
          placeholder="From (USD)"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="text"
          className="field-input"
          placeholder="To (EUR)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
    </ToolForm>
  )
}

function TranslateForm({ onSubmit, onBack }) {
  const [text, setText] = useState('')
  return (
    <ToolForm
      title="Translate"
      onBack={onBack}
      onSubmit={() => onSubmit(translateText(text))}
    >
      <input
        type="text"
        className="field-input"
        placeholder="Text to translate"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </ToolForm>
  )
}

function ToolForm({ title, children, onSubmit, onBack }) {
  return (
    <>
      <div className="home-topbar">
        <button type="button" className="text-button" onClick={onBack}>
          &larr; Back
        </button>
        <span className="wordmark">Kindo</span>
      </div>

      <header className="home-header">
        <p className="eyebrow">Kindo · {title}</p>
        <h2>Ask Kindo.</h2>
      </header>

      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <div className="field-stack">{children}</div>
        <button type="submit" className="cta cta--block">
          Check for 0.05 NIM
        </button>
      </form>
    </>
  )
}

function Result({ data, onAgain, onDone }) {
  return (
    <div className="success-body">
      <div className="stub">
        <div className="stub-top">
          <span className="stub-brand">KINDO</span>
          <span className="stub-brand-sub">RESULT</span>
        </div>
        <div className="stub-row">
          <span>ASKED</span>
          <span>{data.label}</span>
        </div>
        <div className="stub-row">
          <span>PAID</span>
          <span>{data.fee.toFixed(2)} NIM</span>
        </div>
        <div className="stub-perforation" aria-hidden="true" />
        <p className="stub-answer">{data.result}</p>
      </div>

      <button type="button" className="cta cta--block" onClick={onAgain}>
        Check another
      </button>
      <button type="button" className="text-button" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

function Utilities({ onBack }) {
  const [step, setStep] = useState('menu')
  const [result, setResult] = useState(null)

  function handleSubmit(promise) {
    promise.then((data) => {
      setResult(data)
      setStep('result')
    })
  }

  async function registerMobileDataOrder({ orderId, item, extraValue }) {
    const res = await fetch('/api/orders/mobile-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        productId: item.productId,
        packageValue: item.packageValue,
        priceNim: item.priceNim,
        phoneNumber: extraValue,
      }),
    })
    if (!res.ok) throw new Error('Could not register order')
  }

  if (step === 'mobile-data') {
    return (
      <PurchaseFlow
        onBack={() => setStep('menu')}
        fetchItems={fetchTopups}
        kicker="Kindo · Mobile Data"
        heading="Whose phone are we topping up?"
        searchPlaceholder="e.g. MTN Nigeria"
        itemLabel="Top-up"
        extraFieldLabel="Phone number"
        extraFieldPlaceholder="+234 801 234 5678"
        receiptBrandSub="MOBILE DATA"
        stampText="TOPPED UP"
        beforePay={registerMobileDataOrder}
      />
    )
  }

  return (
    <div className="page">
      {step === 'menu' && <Menu onPick={setStep} onBack={onBack} />}

      {step === 'weather' && (
        <WeatherForm onSubmit={handleSubmit} onBack={() => setStep('menu')} />
      )}
      {step === 'currency' && (
        <CurrencyForm onSubmit={handleSubmit} onBack={() => setStep('menu')} />
      )}
      {step === 'translate' && (
        <TranslateForm onSubmit={handleSubmit} onBack={() => setStep('menu')} />
      )}

      {step === 'result' && result && (
        <Result data={result} onAgain={() => setStep('menu')} onDone={onBack} />
      )}
    </div>
  )
}

export default Utilities
