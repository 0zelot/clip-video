import { describe, expect, it } from 'vitest'
import { wordsToSentences } from '../../app/core/captions'
import { parseScript } from '../../app/services/ai/tts'
import { encodeWav, formatAt, parseOverrides, wavDuration } from '../../app/services/ai/voiceFx'

describe('voice-over from speech', () => {
  it('parses a start time next to the other line overrides', () => {
    expect(parseOverrides('at 1:02.5')).toEqual({ at: 62.5 })
    expect(parseOverrides('+2, at 12.25, fast')).toEqual({ pitch: 2, at: 12.25, rate: 1.25 })
    expect(parseOverrides('@3')).toEqual({ at: 3 })
    expect(parseOverrides('at soon')).toEqual({})
  })

  it('writes times that parse back to the same value', () => {
    for (const t of [0, 3.2, 59.99, 62.5, 754.07]) expect(parseOverrides(`at ${formatAt(t)}`).at).toBeCloseTo(t, 2)
    expect(formatAt(75.25)).toBe('1:15.25')
    expect(formatAt(3.2)).toBe('0:03.20')
  })

  it('reads the script lines the speech recognition writes', () => {
    const [line] = parseScript('A [at 0:03.20]: Dzień dobry, to jest test.')
    expect(line).toMatchObject({ speaker: 'A', text: 'Dzień dobry, to jest test.', overrides: { at: 3.2 } })
  })

  it('groups recognised words into sentences at punctuation and pauses', () => {
    const w = (text, start, end) => ({ text, start, end })
    const sentences = wordsToSentences([
      w('Hello,', 0.5, 0.9), w('this', 1.1, 1.3), w('is', 1.3, 1.5), w('a', 1.5, 1.7), w('test.', 1.7, 2.2),
      w('Second', 2.4, 2.8), w('part', 2.8, 3.1),
      w('after', 4.5, 4.9), w('a', 4.9, 5.0), w('pause', 5.0, 5.4),
    ])
    expect(sentences).toEqual([
      { start: 0.5, end: 2.2, text: 'Hello, this is a test.' },
      { start: 2.4, end: 3.1, text: 'Second part' },
      { start: 4.5, end: 5.4, text: 'after a pause' },
    ])
  })

  it('drops lines without words (music or noise)', () => {
    const w = (text, start, end) => ({ text, start, end })
    expect(wordsToSentences([w('...', 1, 1.2), w('♪', 3, 3.5), w('Cześć!', 6, 6.5)])).toEqual([{ start: 6, end: 6.5, text: 'Cześć!' }])
  })

  it('measures the length of a WAV from its header', async () => {
    const samples = new Float32Array(22050 * 1.5)
    const wav = encodeWav({ numberOfChannels: 2, sampleRate: 22050, length: samples.length, getChannelData: () => samples })
    expect(await wavDuration(wav)).toBeCloseTo(1.5, 3)
  })
})
