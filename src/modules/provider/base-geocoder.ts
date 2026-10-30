import { getPool } from '../../config/database.config'
import { AppError } from '../../shared/errors'
import { addressKey, addressMatchesPostal, geocodeQuery, postalAddressLine, PostalPlace } from './postal-address'

export type CoveragePoint = {
    latitude: number
    longitude: number
    label: string
}

const unavailable = () => new AppError('Geocodificação indisponível.', 503)

export const inBrazil = (latitude: number, longitude: number) =>
    latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -34

const fetchJson = async (url: string, headers?: HeadersInit) => {
    try {
        return await fetch(url, {
            headers,
            signal: AbortSignal.timeout(8000),
        })
    } catch {
        throw unavailable()
    }
}

const readCache = async (postalCode: string, key: string) => {
    const result = await getPool().query(
        `SELECT latitude, longitude FROM geocode_cache WHERE postal_code = $1 AND address_key = $2`,
        [postalCode, key],
    )
    return pointFrom(result.rows[0])
}

const readCacheByAddress = async (key: string) => {
    const result = await getPool().query(
        `SELECT latitude, longitude FROM geocode_cache WHERE address_key = $1 LIMIT 1`,
        [key],
    )
    return pointFrom(result.rows[0])
}

const pointFrom = (row?: { latitude: string | number, longitude: string | number }) => {
    if (!row) return null
    return { latitude: Number(row.latitude), longitude: Number(row.longitude) }
}

const writeCache = async (postalCode: string, key: string, latitude: number, longitude: number) => {
    await getPool().query(
        `INSERT INTO geocode_cache (postal_code, address_key, latitude, longitude)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (postal_code, address_key) DO UPDATE SET
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude`,
        [postalCode, key, latitude, longitude],
    )
}

const readViaCep = async (postalCode: string): Promise<PostalPlace | null> => {
    const response = await fetchJson(`https://viacep.com.br/ws/${postalCode}/json/`, {
        Accept: 'application/json',
        'User-Agent': 'MyGroomer/1.0',
    })
    if (response.status === 400) return null
    if (!response.ok) throw unavailable()
    const body = await response.json() as {
        erro?: boolean | string
        logradouro?: string
        bairro?: string
        localidade?: string
        uf?: string
    }
    if (body.erro || !body.localidade || !body.uf) return null
    return {
        logradouro: body.logradouro ?? '',
        bairro: body.bairro ?? '',
        localidade: body.localidade,
        uf: body.uf,
    }
}

const readGeoapify = async (text: string) => {
    const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
    if (!apiKey) throw unavailable()
    const url = new URL('https://api.geoapify.com/v1/geocode/search')
    url.searchParams.set('text', text)
    url.searchParams.set('filter', 'countrycode:br')
    url.searchParams.set('lang', 'pt')
    url.searchParams.set('limit', '1')
    url.searchParams.set('format', 'json')
    url.searchParams.set('apiKey', apiKey)
    const response = await fetchJson(url.toString(), { Accept: 'application/json' })
    if (response.status === 401 || response.status === 403 || response.status === 429) throw unavailable()
    if (!response.ok) throw unavailable()
    const body = await response.json() as {
        results?: { lat?: number, lon?: number, postcode?: string, rank?: { confidence?: number } }[]
    }
    const hit = body.results?.[0]
    if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return null
    if ((hit.rank?.confidence ?? 0) < 0.5) return null
    const latitude = Number(hit.lat)
    const longitude = Number(hit.lon)
    if (!inBrazil(latitude, longitude)) return null
    const postalDigits = String(hit.postcode ?? '').replace(/\D/g, '')
    return {
        latitude,
        longitude,
        postalCode: postalDigits.length === 8 ? postalDigits : '00000000',
    }
}

type AutocompleteHit = {
    lat?: number
    lon?: number
    formatted?: string
    address_line1?: string
    city?: string
    postcode?: string
}

export const autocompleteAddress = async (text: string) => {
    const query = text.trim()
    if (query.length < 3) return []
    const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
    if (!apiKey) throw unavailable()
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
    url.searchParams.set('text', query)
    url.searchParams.set('filter', 'countrycode:br')
    url.searchParams.set('lang', 'pt')
    url.searchParams.set('limit', '5')
    url.searchParams.set('format', 'json')
    url.searchParams.set('apiKey', apiKey)
    const response = await fetchJson(url.toString(), { Accept: 'application/json' })
    if (response.status === 401 || response.status === 403 || response.status === 429) throw unavailable()
    if (!response.ok) throw unavailable()
    const body = await response.json() as { results?: AutocompleteHit[] }
    return (body.results ?? []).flatMap(hit => {
        if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return []
        const latitude = Number(hit.lat)
        const longitude = Number(hit.lon)
        if (!inBrazil(latitude, longitude)) return []
        const street = hit.address_line1?.trim()
        const city = hit.city?.trim()
        const address = [street, city].filter(Boolean).join(', ') || hit.formatted?.trim() || ''
        if (address.length < 3) return []
        const postalDigits = String(hit.postcode ?? '').replace(/\D/g, '')
        return [{
            label: hit.formatted?.trim() || address,
            address: address.slice(0, 200),
            postal_code: postalDigits.length === 8 ? postalDigits : null,
            latitude,
            longitude,
        }]
    })
}

export const lookupPostalAddress = async (postalCode: string) => {
    const digits = postalCode.replace(/\D/g, '')
    if (digits.length !== 8) return null
    const place = await readViaCep(digits)
    if (!place) return null
    const address = postalAddressLine(place)
    if (!address) return null
    return { postal_code: digits, address }
}

export const locateBaseAddress = async (address: string, postalCode: string): Promise<CoveragePoint | null> => {
    const digits = postalCode.replace(/\D/g, '')
    const label = address.trim()
    const key = addressKey(label)
    if (digits.length !== 8 || !key) return null

    const cached = await readCache(digits, key)
    if (cached) return { ...cached, label }

    const place = await readViaCep(digits)
    if (!place || !addressMatchesPostal(label, place)) return null

    const point = await readGeoapify(geocodeQuery(place, label))
    if (!point) return null
    await writeCache(digits, key, point.latitude, point.longitude)
    return { latitude: point.latitude, longitude: point.longitude, label }
}

export const locateSearchAddress = async (address: string): Promise<CoveragePoint | null> => {
    const label = address.trim()
    const key = addressKey(label)
    if (key.length < 3) return null

    const cached = await readCacheByAddress(key)
    if (cached) return { ...cached, label }

    const cep = label.match(/\b(\d{5})-?(\d{3})\b/)
    if (cep) {
        const byPostal = await locateBaseAddress(label, `${cep[1]}${cep[2]}`)
        if (byPostal) return { ...byPostal, label }
    }

    const point = await readGeoapify(label)
    if (!point) return null
    await writeCache(point.postalCode, key, point.latitude, point.longitude)
    return { latitude: point.latitude, longitude: point.longitude, label }
}
