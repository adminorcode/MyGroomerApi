const { test } = require('node:test')
const assert = require('node:assert/strict')
const { addressMatchesPostal, geocodeQuery, postalAddressLine } = require('../dist/modules/provider/postal-address')

const paulista = {
    logradouro: 'Avenida Paulista',
    bairro: 'Bela Vista',
    localidade: 'São Paulo',
    uf: 'SP',
}

test('typed address must contain the street returned for the postal code', () => {
    assert.equal(addressMatchesPostal('Avenida Paulista, São Paulo', paulista), true)
    assert.equal(addressMatchesPostal('avenida paulista 1578', paulista), true)
    assert.equal(addressMatchesPostal('Rua sem mapa, 10', paulista), false)
    assert.equal(addressMatchesPostal('Avenida Paulista, São Paulo', {
        logradouro: 'Rua dos Trilhos',
        bairro: 'Jabaquara',
        localidade: 'São Paulo',
        uf: 'SP',
    }), false)
})

test('a postal code without a street matches the district or the city', () => {
    const citywide = { logradouro: '', bairro: 'Jabaquara', localidade: 'São Paulo', uf: 'SP' }
    assert.equal(addressMatchesPostal('Jabaquara, São Paulo', citywide), true)
    assert.equal(addressMatchesPostal('Rua sem mapa, 10', citywide), false)
})

test('a postal code becomes a street and city line', () => {
    assert.equal(postalAddressLine(paulista), 'Avenida Paulista, São Paulo')
    assert.equal(postalAddressLine({
        logradouro: '',
        bairro: 'Jardim Sabará',
        localidade: 'Porto Alegre',
        uf: 'RS',
    }), 'Jardim Sabará, Porto Alegre')
})

test('the geocode query keeps the house number and the city from the postal code', () => {
    assert.equal(
        geocodeQuery(paulista, 'Avenida Paulista, 1578'),
        'Avenida Paulista 1578, Bela Vista, São Paulo - SP, Brasil',
    )
})
