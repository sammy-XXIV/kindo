// Real Bitrefill gift-card catalog (x402, paid per call) via the Kindo backend.
// Two steps, so a search never pays for amounts the customer doesn't open:
// fetchProducts lists brands; fetchPackages loads one brand's amounts on tap.

const COUNTRY_NAMES = { NG: 'Nigeria', US: 'USA', GB: 'UK', PR: 'Puerto Rico', IE: 'Ireland' }

function where(countries) {
  if (!countries.length) return 'Worldwide'
  return countries
    .slice(0, 3)
    .map((c) => COUNTRY_NAMES[c] || c)
    .join(' · ')
}

function prettyCategory(category) {
  return category ? category.replace(/[-_]/g, ' ') : ''
}

export async function fetchProducts(query) {
  const q = query.trim()
  if (!q) return []

  const res = await fetch(`/api/shop/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = await res.json()

  return (data.brands || []).map((b) => ({
    id: b.slug,
    slug: b.slug,
    title: b.name,
    subtitle: [where(b.countries), prettyCategory(b.category)].filter(Boolean).join(' · '),
    thumb: (b.name || '?').trim().charAt(0).toUpperCase(),
    productUrl: b.productUrl,
    // No price yet — the amounts unfold when the row is tapped.
    expandable: true,
  }))
}

// One brand's amounts, shaped as full purchasable items so picking one drops
// straight into the shared confirm → pay → receipt flow.
export async function fetchPackages(brand) {
  const res = await fetch(`/api/shop/packages?slug=${encodeURIComponent(brand.slug)}`)
  if (!res.ok) throw new Error(`Could not load amounts (${res.status})`)
  const data = await res.json()

  return (data.packages || []).map((p) => ({
    id: `${brand.slug}-${p.packageValue}`,
    title: `${p.currency} ${Number(p.packageValue).toLocaleString()}`,
    subtitle: brand.title,
    thumb: brand.thumb,
    priceNim: p.priceNim,
    priceUsd: p.priceUsd,
    rating: data.rating,
    reviewCount: data.reviewCount,
    productUrl: data.productUrl || brand.productUrl,
    productId: brand.slug,
    packageValue: p.packageValue,
    recipientType: data.recipientType,
  }))
}
