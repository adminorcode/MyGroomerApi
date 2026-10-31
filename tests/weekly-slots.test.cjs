const { test } = require('node:test')
const assert = require('node:assert/strict')
const slots = require('../dist/modules/provider/weekly-availability.slots')

const openMonday = {
    enabled: true,
    start: '09:00',
    end: '13:00',
    break_start: null,
    break_end: null,
}

test('monday slots keep the chosen gap between 60 minute services', () => {
    assert.equal(slots.weekdayOf('2026-11-02'), 'mon')
    const gap30 = slots.generateStartMinutes({
        day: openMonday,
        durationMinutes: 60,
        travelGapMinutes: 30,
    }).map(slots.minutesToClock)
    const gap15 = slots.generateStartMinutes({
        day: openMonday,
        durationMinutes: 60,
        travelGapMinutes: 15,
    }).map(slots.minutesToClock)
    assert.deepEqual(gap30, ['09:00', '10:30', '12:00'])
    assert.deepEqual(gap15, ['09:00', '10:15', '11:30'])
})

test('a disabled day offers no slot', () => {
    const starts = slots.generateStartMinutes({
        day: { enabled: false, start: '09:00', end: '13:00', break_start: null, break_end: null },
        durationMinutes: 60,
        travelGapMinutes: 30,
    })
    assert.deepEqual(starts, [])
})

test('end before start and a break outside the day are invalid', () => {
    assert.equal(
        slots.dayIssue({ enabled: true, start: '18:00', end: '09:00', break_start: null, break_end: null }, 'segunda-feira'),
        'O fim de segunda-feira precisa ser depois do início.',
    )
    assert.equal(
        slots.dayIssue({ enabled: true, start: '09:00', end: '12:00', break_start: '13:00', break_end: '14:00' }, 'segunda-feira'),
        'O intervalo de segunda-feira precisa ficar dentro da jornada.',
    )
})

test('manual time outside the routine is not covered and an occupied slot is skipped', () => {
    assert.equal(slots.routineCovers(openMonday, 14 * 60, 14 * 60 + 30), false)
    assert.equal(slots.routineCovers(openMonday, 9 * 60 + 30, 10 * 60), true)
    const starts = slots.generateStartMinutes({
        day: openMonday,
        durationMinutes: 60,
        travelGapMinutes: 30,
        occupied: [{ start: 9 * 60, end: 10 * 60 }],
    }).map(slots.minutesToClock)
    assert.deepEqual(starts, ['10:30', '12:00'])
})
