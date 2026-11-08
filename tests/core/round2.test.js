import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createBlurItem, createItemFromAsset, createProject } from '../../app/core/model/defaults'
import { normalizeProject } from '../../app/core/model/schema'
import { addMarker } from '../../app/core/operations/project'
import { collectSnapPoints } from '../../app/core/operations/snap'
import { insertFreezeFrame, insertOverlay, setItemSpeed, splitItem, trimItemEnd } from '../../app/core/operations/items'
import { effectsAt, removeKeyframesAt, resolveItemAt, setKeyframes, valueAt } from '../../app/core/render/animate'
import { consumedAt, durationForRamp, sourceRange, sourceTimeAt, speedAt } from '../../app/core/time'
import { parseScript } from '../../app/services/ai/tts'

const video = { id: 'a1', kind: 'video', name: 'clip.mp4', duration: 20, width: 1080, height: 1920, hasAudio: true }
const image = { id: 'i1', kind: 'image', name: 'logo.png', width: 512, height: 512 }

function setup() {
  const p = createProject('T')
  p.assets[video.id] = video
  p.assets[image.id] = image
  const item = createItemFromAsset(video, 0)
  item.duration = 10
  p.tracks[0].items.push(item)
  return { p, item }
}
const find = (p, id) => p.tracks.flatMap((t) => t.items).find((i) => i.id === id)

describe('speed ramps', () => {
  it('keeps the used source range and eases the speed', () => {
    const { p, item } = setup()
    const next = produce(p, (d) => void setItemSpeed(d, item.id, 2, { ramp: { from: 1, rampIn: 1, rampOut: 1 } }))
    const it2 = find(next, item.id)
    expect(sourceRange(it2)).toBeCloseTo(10, 6)
    expect(speedAt(it2, 0)).toBeCloseTo(1, 6)
    expect(speedAt(it2, 0.5)).toBeCloseTo(1.5, 6)
    expect(speedAt(it2, it2.duration / 2)).toBeCloseTo(2, 6)
    expect(speedAt(it2, it2.duration)).toBeCloseTo(1, 6)
    // ramps (1 s each at avg 1.5×) consume 3 s, the rest (7 s) plays at 2×
    expect(it2.duration).toBeCloseTo(2 + 3.5, 6)
  })
  it('maps time monotonically and continuously', () => {
    const { p, item } = setup()
    const next = produce(p, (d) => void setItemSpeed(d, item.id, 3, { ramp: { from: 0.5, rampIn: 1.2, rampOut: 0.8 } }))
    const it2 = find(next, item.id)
    let prev = -1
    for (let t = 0; t <= it2.duration + 1e-9; t += 0.01) {
      const s = consumedAt(it2, t)
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = s
    }
    expect(sourceTimeAt(it2, it2.duration)).toBeCloseTo(10, 5)
  })
  it('shortens ramps that do not fit', () => {
    const fit = durationForRamp(1, 4, 1, 5, 5)
    expect(fit.rampIn + fit.rampOut).toBeLessThanOrEqual(fit.duration + 1e-9)
    expect(fit.duration).toBeGreaterThan(0)
  })
  it('splitting a ramped clip keeps the cut position in the source', () => {
    const { p, item } = setup()
    let rightId
    const ramped = produce(p, (d) => void setItemSpeed(d, item.id, 2, { ramp: { from: 1, rampIn: 1, rampOut: 1 } }))
    const before = sourceTimeAt(find(ramped, item.id), 0.7)
    const next = produce(ramped, (d) => void (rightId = splitItem(d, item.id, 0.7)))
    const right = find(next, rightId)
    const left = find(next, item.id)
    expect(right.sourceIn).toBeCloseTo(before, 6)
    expect(sourceRange(left) + sourceRange(right)).toBeCloseTo(10, 5)
    expect(left.speedRamp).toBeUndefined()
  })
  it('trimming flattens the ramp to the same average speed', () => {
    const { p, item } = setup()
    const ramped = produce(p, (d) => void setItemSpeed(d, item.id, 2, { ramp: { from: 1, rampIn: 1, rampOut: 1 } }))
    const d0 = find(ramped, item.id).duration
    const next = produce(ramped, (d) => void trimItemEnd(d, item.id, d0 - 1))
    const it2 = find(next, item.id)
    expect(it2.speedRamp).toBeUndefined()
    expect(it2.speed).toBeCloseTo(10 / d0, 6)
  })
})

describe('effect fades & keyframes', () => {
  it('blends effects in and out', () => {
    const item = { duration: 4, effects: { brightness: 2, contrast: 1 }, effectsRamp: { from: { brightness: 1 }, rampIn: 1, rampOut: 1 } }
    expect(effectsAt(item, 0).brightness).toBeCloseTo(1, 6)
    expect(effectsAt(item, 0.5).brightness).toBeCloseTo(1.5, 6)
    expect(effectsAt(item, 2).brightness).toBe(2)
    expect(effectsAt(item, 4).brightness).toBeCloseTo(1, 6)
  })
  it('interpolates keyframes and removes them', () => {
    const item = { duration: 4, opacity: 1, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0 } }
    setKeyframes(item, 0, { x: 0.2, opacity: 0 })
    setKeyframes(item, 2, { x: 0.8, opacity: 1 })
    expect(resolveItemAt(item, 1).transform.x).toBeCloseTo(0.5, 6)
    expect(resolveItemAt(item, 3).transform.x).toBeCloseTo(0.8, 6)
    expect(valueAt(item.keyframes.opacity, -1, 5)).toBe(0)
    removeKeyframesAt(item, 0)
    removeKeyframesAt(item, 2)
    expect(item.keyframes).toBeUndefined()
  })
})

describe('overlays, blur, freeze frame, markers', () => {
  it('puts overlays above the main track without overlapping', () => {
    const { p } = setup()
    const a = createItemFromAsset(image, 1)
    const b = createItemFromAsset(image, 2)
    const next = produce(p, (d) => {
      insertOverlay(d, a)
      insertOverlay(d, b)
    })
    const visual = next.tracks.filter((t) => t.kind === 'visual')
    expect(visual).toHaveLength(3)
    expect(visual[2].items).toHaveLength(1)
  })
  it('round-trips blur items through save / load', () => {
    const { p } = setup()
    const blur = createBlurItem({ start: 1, invert: true })
    const next = produce(p, (d) => void insertOverlay(d, blur))
    const loaded = normalizeProject(JSON.parse(JSON.stringify(next)))
    const restored = loaded.tracks.flatMap((t) => t.items).find((i) => i.type === 'blur')
    expect(restored).toMatchObject({ invert: true, mode: 'blur', shape: 'ellipse' })
  })
  it('inserts a freeze frame and pushes the rest', () => {
    const { p, item } = setup()
    const still = { ...createItemFromAsset(image, 0), duration: 2 }
    const next = produce(p, (d) => void insertFreezeFrame(d, item.id, 4, still))
    const items = next.tracks[0].items
    expect(items.map((i) => i.type)).toEqual(['video', 'image', 'video'])
    expect(items[2].start).toBeCloseTo(6, 6)
    expect(items[2].sourceIn).toBeCloseTo(4, 6)
  })
  it('stores markers and snaps to them', () => {
    const { p } = setup()
    const next = produce(p, (d) => void addMarker(d, { id: 'm', t: 3.3, label: '', color: '#fff' }))
    expect(collectSnapPoints(next, [])).toContain(3.3)
    expect(normalizeProject(JSON.parse(JSON.stringify(next))).markers).toHaveLength(1)
  })
})

describe('dialogue scripts', () => {
  it('parses speakers and continuation lines', () => {
    expect(parseScript('A: Cześć!\nB: Hej\ndalej mówi B\n\nAnna Maria: Tak')).toEqual([
      { speaker: 'A', text: 'Cześć!', overrides: {} },
      { speaker: 'B', text: 'Hej', overrides: {} },
      { speaker: 'B', text: 'dalej mówi B', overrides: {} },
      { speaker: 'Anna Maria', text: 'Tak', overrides: {} },
    ])
  })
  it('reads per-line voice changes', () => {
    const [line] = parseScript('B [+3, 1.2x, echo, loud, pause 0.5]: Serio?!')
    expect(line).toEqual({ speaker: 'B', text: 'Serio?!', overrides: { pitch: 3, rate: 1.2, effect: 'echo', volume: 4, pause: 0.5 } })
    expect(parseScript('A [fast, low, radio]: x')[0].overrides).toEqual({ rate: 1.25, pitch: -3, effect: 'radio' })
    expect(parseScript('Time: 12:30 tomorrow')[0].speaker).toBe('Time')
  })
})
