export type PostalPlace = {
    logradouro: string
    bairro: string
    localidade: string
    uf: string
}

export const foldAddress = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

export const addressKey = (address: string) => foldAddress(address).slice(0, 200)

export const postalAddressLine = (place: PostalPlace) => {
    const city = place.localidade.trim()
    const street = place.logradouro.trim()
    if (street && city) return `${street}, ${city}`
    const district = place.bairro.trim()
    if (district && city) return `${district}, ${city}`
    if (city && place.uf.trim()) return `${city} - ${place.uf.trim()}`
    return city
}

export const addressMatchesPostal = (address: string, place: PostalPlace) => {
    const text = foldAddress(address)
    const street = foldAddress(place.logradouro)
    if (street) return text.includes(street)
    const district = foldAddress(place.bairro)
    if (district && text.includes(district)) return true
    const city = foldAddress(place.localidade)
    return city.length > 0 && text.includes(city)
}

const houseNumber = (address: string) => {
    const match = address.match(/\b(\d{1,6})\b/)
    return match ? match[1] : null
}

export const geocodeQuery = (place: PostalPlace, address: string) => {
    const street = [place.logradouro.trim(), houseNumber(address)].filter(Boolean).join(' ')
    const city = `${place.localidade.trim()} - ${place.uf.trim()}`
    return [street, place.bairro.trim(), city, 'Brasil'].filter(part => part.length > 0).join(', ')
}
