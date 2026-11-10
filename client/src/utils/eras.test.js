import { expect, test } from 'vitest'
import { buildEras, sortableDate } from './eras.js'
import { release } from './intelligenceFixtures.js'

const A = [{ id: 'a', name: 'A' }]
const single = (id, name, date) => release(id, name, date, A, { group: 'single', albumType: 'single', inferredType: 'single', totalTracks: 1 })

const releases = [
  single('s0', 'Early Demo', '2009-05'),
  release('alb1', 'First', '2012-09-14', A),
  single('s1', 'Lead Single', '2014-03-06'),
  release('alb2', 'Second', '2015-05-22', A),
  release('alb2d', 'Second (Deluxe Edition)', '2016-02-05', A),
  single('s2', 'Aftermath Single', '2016-08-17'), // 31 months before Third -> stays with Second
  release('alb3', 'Third', '2019-03-19', A),
  release('feat', 'Guest Spot', '2019-01', [{ id: 'b', name: 'B' }], { group: 'appears_on' }),
  single('s3', 'After Everything', '2023'),
]

test('each studio album anchors an era; editions join the original', () => {
  const eras = buildEras(releases)
  expect(eras.map((e) => e.title)).toEqual(['Before First', 'First', 'Second', 'Third'])
  expect(eras[2].editions.map((e) => e.id)).toEqual(['alb2d'])
})

test('singles within 24 months before an album lead up to it; others follow the previous album', () => {
  const eras = buildEras(releases)
  const roles = Object.fromEntries(eras.flatMap((era) => era.releases.map((r) => [r.id, `${era.title}:${r.role}`])))
  expect(roles).toEqual({
    s0: 'Before First:before', // 2009, 40 months before First
    s1: 'Second:lead-up',
    s2: 'Second:after',
    feat: 'Third:lead-up',
    s3: 'Third:after',
  })
})

test('no studio albums: one era with everything; nothing: no eras', () => {
  expect(buildEras([single('x', 'X', '2020-01-01')]).map((e) => e.title)).toEqual(['All releases'])
  expect(buildEras([])).toEqual([])
})

test('partial dates sort at the start of their period', () => {
  expect(sortableDate('2019')).toBe('2019-01-01')
  expect(sortableDate('2019-05')).toBe('2019-05-01')
  expect(sortableDate('2019-05-07')).toBe('2019-05-07')
})
