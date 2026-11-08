import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { autoEnhanceFromPixels, dbToAmplitude, detectSilences } from '../../app/core/analysis/smart'
import { applyFilterPreset, createItemFromAsset, createProject, FILTER_PRESETS, TRANSITIONS } from '../../app/core/model/defaults'
import { normalizeProject } from '../../app/core/model/schema'
import { defaultProjectName, uniqueName } from '../../app/core/naming'
import { applyTransitionToTrack, cutRangesFromItem, setItemSpeed } from '../../app/core/operations/items'
import { motionAt } from '../../app/core/render/compositor'
import { itemEnd, speedForDuration } from '../../app/core/time'

const video = {
  id: 'a1',
  kind: 'video',
  name: 'clip.mp4',
  duration: 10,
  width: 1920,
  height: 1080,
  hasAudio: true,
}

function projectWithClip() {
  const p = createProject('Test')
  p.assets[video.id] = video
  const item = createItemFromAsset(video, 0)
  const track = p.tracks.find((t) => t.kind === 'visual')
  track.items.push(item)
  return { p, item, track }
}

describe('unique project names', () => {
  it('keeps a free name', () => {
    expect(uniqueName('Vlog', ['Other'])).toBe('Vlog')
  })
  it('numbers taken names, case-insensitively', () => {
    expect(uniqueName('Vlog', ['vlog'])).toBe('Vlog (2)')
    expect(uniqueName('Vlog', ['Vlog', 'Vlog (2)', 'Vlog (3)'])).toBe('Vlog (4)')
  })
  it('continues an existing number', () => {
    expect(uniqueName('Vlog (2)', ['Vlog', 'Vlog (2)'])).toBe('Vlog (3)')
  })
  it('falls back for empty names and normalises whitespace', () => {
    expect(uniqueName('   ', [])).toBe('Untitled project')
    expect(uniqueName('  My   video ', ['x'])).toBe('My video')
  })
  it('creates format-aware default names', () => {
    const date = new Date(2026, 10, 4, 9, 5)
    expect(defaultProjectName({ width: 1080, height: 1920 }, date)).toBe('Short · 4 Nov 09:05')
    expect(defaultProjectName({ width: 1920, height: 1080 }, date)).toBe('Video · 4 Nov 09:05')
  })
})

describe('speed', () => {
  it('computes the speed for a wanted duration', () => {
    expect(speedForDuration(10, 8.6)).toBeCloseTo(1.16279, 4)
    expect(speedForDuration(10, 0)).toBeNull()
  })
  it('accepts arbitrary precise speeds like 1.16×', () => {
    const { p, item } = projectWithClip()
    const next = produce(p, (d) => void setItemSpeed(d, item.id, 1.16))
    const changed = next.tracks.flatMap((t) => t.items).find((i) => i.id === item.id)
    expect(changed.speed).toBe(1.16)
    expect(changed.duration).toBeCloseTo(10 / 1.16, 6)
  })
})

describe('silence detection', () => {
  // 100 buckets per second: 1 s loud, 1 s silent, 1 s loud
  const peaks = new Float32Array(300)
  peaks.fill(0.5, 0, 100)
  peaks.fill(0.001, 100, 200)
  peaks.fill(0.5, 200, 300)

  it('finds pauses and keeps padding', () => {
    const ranges = detectSilences(peaks, 100, 0, 3, { threshold: dbToAmplitude(-30), minSilence: 0.4, padding: 0.1 })
    expect(ranges).toHaveLength(1)
    expect(ranges[0][0]).toBeCloseTo(1.1, 5)
    expect(ranges[0][1]).toBeCloseTo(1.9, 5)
  })
  it('ignores pauses shorter than the minimum', () => {
    expect(detectSilences(peaks, 100, 0, 3, { minSilence: 1.5 })).toHaveLength(0)
  })
  it('cuts silent edges without padding', () => {
    const quietStart = new Float32Array(200)
    quietStart.fill(0.5, 100, 200)
    const ranges = detectSilences(quietStart, 100, 0, 2, { padding: 0.1 })
    expect(ranges[0][0]).toBe(0)
    expect(ranges[0][1]).toBeCloseTo(0.9, 5)
  })
})

describe('cutting ranges out of a clip', () => {
  it('removes the ranges and closes the gaps', () => {
    const { p, item } = projectWithClip()
    const next = produce(p, (d) => void cutRangesFromItem(d, item.id, [[2, 3], [5, 6.5]]))
    const track = next.tracks.find((t) => t.kind === 'visual')
    expect(track.items).toHaveLength(3)
    expect(itemEnd(track.items[2])).toBeCloseTo(7.5, 6)
    // contiguous pieces, correct source offsets
    expect(track.items[1].start).toBeCloseTo(2, 6)
    expect(track.items[1].sourceIn).toBeCloseTo(3, 6)
    expect(track.items[2].start).toBeCloseTo(4, 6)
    expect(track.items[2].sourceIn).toBeCloseTo(6.5, 6)
    expect(track.items[0].id).toBe(item.id)
  })
  it('shifts later clips on the same track', () => {
    const { p, item, track } = projectWithClip()
    const after = createItemFromAsset(video, 10)
    track.items.push(after)
    const next = produce(p, (d) => void cutRangesFromItem(d, item.id, [[4, 5]]))
    const moved = next.tracks.flatMap((t) => t.items).find((i) => i.id === after.id)
    expect(moved.start).toBeCloseTo(9, 6)
  })
})

describe('transitions & effects', () => {
  it('applies a transition to every cut of a track', () => {
    const { p, item, track } = projectWithClip()
    track.items.push(createItemFromAsset(video, 10), createItemFromAsset(video, 20))
    let count = 0
    produce(p, (d) => void (count = applyTransitionToTrack(d, item.id, { kind: 'whip', duration: 0.4, direction: 'left' })))
    expect(count).toBe(2)
  })
  it('offers many transitions and filters', () => {
    expect(TRANSITIONS.length).toBeGreaterThanOrEqual(15)
    expect(FILTER_PRESETS.length).toBeGreaterThanOrEqual(15)
    expect(applyFilterPreset('noir').grain).toBeGreaterThan(0)
  })
  it('computes Ken Burns motion over the clip', () => {
    const item = { duration: 4, motion: { kind: 'zoomIn', amount: 1 } }
    expect(motionAt(item, 0, 1080, 1920).scale).toBeCloseTo(1, 6)
    expect(motionAt(item, 4, 1080, 1920).scale).toBeCloseTo(1.35, 6)
    expect(motionAt({ duration: 4 }, 2, 1080, 1920)).toEqual({ scale: 1, translateX: 0, translateY: 0 })
  })
  it('keeps motion through save / load', () => {
    const { p, item } = projectWithClip()
    p.tracks[0].items[0] = { ...item, motion: { kind: 'panLeft', amount: 2 } }
    const loaded = normalizeProject(JSON.parse(JSON.stringify(p)))
    expect(loaded.tracks[0].items[0].motion).toEqual({ kind: 'panLeft', amount: 1 })
  })
  it('keeps the voice-over dialogue per project through save / load', () => {
    const p = createProject('With dialogue')
    p.voiceover = { speakers: [{ name: 'A', voiceId: 'pl_PL-gosia-medium' }], script: 'A: Cześć', gap: 0.25, withCaptions: true }
    expect(normalizeProject(JSON.parse(JSON.stringify(p))).voiceover).toEqual(p.voiceover)
    // A new project has no dialogue of its own.
    expect(normalizeProject(createProject('Fresh')).voiceover).toBeUndefined()
    expect(normalizeProject({ ...createProject('Broken'), voiceover: 'nope' }).voiceover).toBeUndefined()
  })
  it('suggests brighter settings for dark footage', () => {
    const dark = new Uint8ClampedArray(64 * 4).map((_, i) => (i % 4 === 3 ? 255 : 30 + (i % 7)))
    const fix = autoEnhanceFromPixels(dark)
    expect(fix.brightness).toBeGreaterThan(1.1)
  })
})

