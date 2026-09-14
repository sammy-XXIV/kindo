// Real mobile top-up search via the Kindo backend (Bitrefill, x402, paid per
// call). Operator first, then amounts on tap — same shape as Shop.

const COUNTRY_NAMES = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', US: 'USA', GB: 'UK', IN: 'India', EG: 'Egypt' }

function where(countries) {
  if (!countries.length) return 'International'
  return countries
    .slice(0, 2)
    .map((c) => COUNTRY_NAMES[c] || c)
    .join(' · ')
}

export async function fetchTopups(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/utilities/mobile-data/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()

  return (data.operators || []).map((o) => ({
    id: o.slug,
    slug: o.slug,
    title: o.name,
    subtitle: [where(o.countries), o.currency].filter(Boolean).join(' · '),
    thumb: (o.name || '?').trim().charAt(0).toUpperCase(),
    expandable: true,
  }))
}

// One operator's amounts, shaped as full purchasable items.
export async function fetchTopupPackages(operator) {
  const res = await fetch(`/api/utilities/mobile-data/packages?slug=${encodeURIComponent(operator.slug)}`)
  if (!res.ok) throw new Error(`Could not load amounts (${res.status})`)
  const data = await res.json()

  return (data.packages || []).map((p) => ({
    id: `${operator.slug}-${p.packageValue}`,
    title: `${p.currency} ${Number(p.packageValue).toLocaleString()}`,
    subtitle: operator.title,
    thumb: operator.thumb,
    priceNim: p.priceNim,
    priceUsd: p.priceUsd,
    productId: operator.slug,
    packageValue: p.packageValue,
    countryCode: data.countryCode,
  }))
}
