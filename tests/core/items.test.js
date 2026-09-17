import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { createItemFromAsset, createProject } from '../../app/core/model/defaults'
import { activeItemOnTrack, findItem, projectDuration } from '../../app/core/model/queries'
import { normalizeProject } from '../../app/core/model/schema'
import {
  addAssetToTimeline,
  deleteItems,
  deleteRange,
  duplicateItems,
  findFreeStart,
  getTrimBounds,
  moveItem,
  splitAt,
  splitItem,
  trimItemEnd,
  trimItemStart,
} from '../../app/core/operations/items'
import { collectSnapPoints, snapEdges } from '../../app/core/operations/snap'
import { formatTimecode, parseTime, sourceTimeAt } from '../../app/core/time'

const video = {
  id: 'a1',
  kind: 'video',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  size: 1,
  lastModified: 0,
  storage: 'indexeddb',
  duration: 10,
  width: 1920,
  height: 1080,
  hasAudio: true,
  importedAt: 0,
}

function setup() {
  const p = createProject('Test')
  p.assets[video.id] = video
  return p
}

function visual(p) {
  return p.tracks.find((t) => t.kind === 'visual')
}

function assertInvariants(p) {
  for (const track of p.tracks) {
    for (let i = 1; i < track.items.length; i++) {
      const prev = track.items[i - 1]
      const cur = track.items[i]
      expect(cur.start).toBeGreaterThanOrEqual(prev.start)
      expect(cur.start + 1e-6).toBeGreaterThanOrEqual(prev.start + prev.duration)
    }
  }
}

describe('placement', () => {
  it('appends sequential clips on the main track', () => {
    let p = setup()
    p = produce(p, (d) => {
      addAssetToTimeline(d, video, { playhead: 0 })
      addAssetToTimeline(d, video, { playhead: 10 })
    })
    const items = visual(p).items
    expect(items.map((i) => i.start)).toEqual([0, 10])
    expect(projectDuration(p)).toBe(20)
  })

  it('puts clips on a new track when the playhead is occupied', () => {
    let p = setup()
    p = produce(p, (d) => {
      addAssetToTimeline(d, video, { playhead: 0 })
      addAssetToTimeline(d, video, { playhead: 0 })
    })
    expect(p.tracks.filter((t) => t.kind === 'visual')).toHaveLength(2)
    assertInvariants(p)
  })

  it('finds the closest free slot', () => {
    const track = { id: 't', kind: 'visual', name: '', hidden: false, muted: false, locked: false, items: [] }
    const a = createItemFromAsset(video, 0)
    a.duration = 5
    const b = createItemFromAsset(video, 8)
    b.duration = 5
    track.items = [a, b]
    expect(findFreeStart(track, 2, 6)).toBe(6)
    expect(findFreeStart(track, 4, 6)).toBe(13)
    expect(findFreeStart(track, 3, 4)).toBe(5)
  })
})

describe('editing', () => {
  function withClip() {
    return produce(setup(), (d) => void addAssetToTimeline(d, video, { playhead: 0 }))
  }

  it('splits a clip keeping source continuity', () => {
    const p0 = withClip()
    const id = visual(p0).items[0].id
    const p = produce(p0, (d) => void splitItem(d, id, 4))
    const [left, right] = visual(p).items
    expect(left.duration).toBe(4)
    expect(right.start).toBe(4)
    expect(right.duration).toBe(6)
    expect(right.sourceIn).toBe(4)
    expect(sourceTimeAt(right, 5)).toBe(5)
    // original is untouched (immutability)
    expect(visual(p0).items).toHaveLength(1)
  })

  it('trims start and end within source bounds', () => {
    const p0 = withClip()
    const id = visual(p0).items[0].id
    const p1 = produce(p0, (d) => void trimItemStart(d, id, 2))
    const item = findItem(p1, id)
    expect(item.start).toBe(2)
    expect(item.sourceIn).toBe(2)
    expect(item.duration).toBe(8)
    // cannot extend beyond source start
    const p2 = produce(p1, (d) => void trimItemStart(d, id, -5))
    expect(findItem(p2, id).sourceIn).toBe(0)
    expect(findItem(p2, id).start).toBe(0)
    // cannot extend beyond source end
    const p3 = produce(p2, (d) => void trimItemEnd(d, id, 50))
    expect(findItem(p3, id).duration).toBe(10)
    expect(getTrimBounds(p3, id, 'end').max).toBe(10)
  })

  it('moves between tracks without overlap', () => {
    let p = produce(setup(), (d) => {
      addAssetToTimeline(d, video, { playhead: 0 })
      addAssetToTimeline(d, video, { playhead: 10 })
    })
    const [first, second] = visual(p).items
    p = produce(p, (d) => void moveItem(d, second.id, visual(p).id, 3))
    // overlapping target resolves to nearest free position (after the first clip)
    expect(findItem(p, second.id).start).toBe(10)
    const audioTrack = p.tracks.find((t) => t.kind === 'audio')
    let accepted = true
    const moved = produce(p, (d) => void (accepted = moveItem(d, first.id, audioTrack.id, 0)))
    // video items are rejected by audio tracks
    expect(accepted).toBe(false)
    expect(findItem(moved, first.id)).toBeDefined()
    expect(moved.tracks.find((t) => t.kind === 'audio').items).toHaveLength(0)
    assertInvariants(p)
  })

  it('split at playhead, duplicate and delete', () => {
    let p = withClip()
    let created = []
    p = produce(p, (d) => void (created = splitAt(d, 5)))
    expect(created).toHaveLength(1)
    let dup = []
    p = produce(p, (d) => void (dup = duplicateItems(d, [created[0]])))
    expect(findItem(p, dup[0]).start).toBe(10)
    p = produce(p, (d) => void deleteItems(d, [created[0]]))
    expect(findItem(p, created[0])).toBeUndefined()
    assertInvariants(p)
  })

  it('ripple-deletes a range', () => {
    let p = produce(setup(), (d) => {
      addAssetToTimeline(d, video, { playhead: 0 })
      addAssetToTimeline(d, video, { playhead: 10 })
    })
    p = produce(p, (d) => deleteRange(d, 8, 12, true))
    const items = visual(p).items
    expect(items).toHaveLength(2)
    expect(items[0].duration).toBeCloseTo(8)
    expect(items[1].start).toBeCloseTo(8)
    expect(items[1].sourceIn).toBeCloseTo(2)
    expect(projectDuration(p)).toBeCloseTo(16)
    expect(activeItemOnTrack(visual(p), 8.5).id).toBe(items[1].id)
  })
})

describe('utilities', () => {
  it('snaps edges to nearby points', () => {
    const p = produce(setup(), (d) => void addAssetToTimeline(d, video, { playhead: 0 }))
    const points = collectSnapPoints(p, [], [4])
    expect(snapEdges([9.9], points, 0.2)).toEqual({ delta: expect.closeTo(0.1), point: 10 })
    expect(snapEdges([7], points, 0.2).point).toBeNull()
  })

  it('formats and parses time', () => {
    expect(formatTimecode(65.5, 30)).toBe('01:05.15')
    expect(parseTime('1:05.5')).toBe(65.5)
    expect(parseTime('abc')).toBeNull()
  })

  it('normalizes partial persisted projects', () => {
    const raw = {
      id: 'x',
      name: 'Old',
      tracks: [{ id: 't', kind: 'visual', items: [{ id: 'i', type: 'video', assetId: 'a1', start: 1, duration: 2 }] }],
    }
    const p = normalizeProject(raw)
    const item = p.tracks[0].items[0]
    expect(item.transform.scale).toBe(1)
    expect(item.audio.volume).toBe(1)
    expect(p.settings.fps).toBe(30)
  })
})
