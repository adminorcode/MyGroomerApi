export type CoveragePoint = {
    latitude: number
    longitude: number
    label: string
}

const term = (token: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${token}(?:$|[^\\p{L}\\p{N}])`, 'iu')
const cep = (digits: string) => new RegExp(`(?:^|\\D)${digits.slice(0, 5)}-?${digits.slice(5)}(?:\\D|$)`)

const places: { pattern: RegExp, point: CoveragePoint }[] = [
    {
        pattern: term('paulista'),
        point: { latitude: -23.561414, longitude: -46.655881, label: 'Avenida Paulista, São Paulo' },
    },
    {
        pattern: cep('01310100'),
        point: { latitude: -23.561414, longitude: -46.655881, label: 'Avenida Paulista, São Paulo' },
    },
    {
        pattern: term('jabaquara'),
        point: { latitude: -23.646389, longitude: -46.640833, label: 'Jabaquara, São Paulo' },
    },
    {
        pattern: cep('04344000'),
        point: { latitude: -23.646389, longitude: -46.640833, label: 'Jabaquara, São Paulo' },
    },
    {
        pattern: term('copacabana'),
        point: { latitude: -22.971177, longitude: -43.182543, label: 'Copacabana, Rio de Janeiro' },
    },
    {
        pattern: cep('22070010'),
        point: { latitude: -22.971177, longitude: -43.182543, label: 'Copacabana, Rio de Janeiro' },
    },
]

export const resolveCoverageAddress = (address: string): CoveragePoint | null => {
    const text = address.trim()
    const hits = places.filter(place => place.pattern.test(text))
    const labels = new Set(hits.map(place => place.point.label))
    if (labels.size !== 1) return null
    return hits[0].point
}
