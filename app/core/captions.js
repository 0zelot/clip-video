/**
 * Caption helpers: parsing subtitle files, turning plain text or word
 * timestamps into short phrases (TikTok / Shorts style) and editing them.
 *
 * A phrase is the unit that gets its own caption item on the timeline:
 * @typedef {object} CaptionPhrase
 * @property {number} start absolute time on the timeline
 * @property {number} end
 * @property {string} text
 * @property {{ text: string, start: number, end: number }[]} words absolute times
 */

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})|(\d{1,2}):(\d{2})[,.](\d{1,3})/

function parseTimestamp(value) {
  const m = value.trim().match(TIME_RE)
  if (!m) return null
  if (m[1] !== undefined) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000
  return Number(m[5]) * 60 + Number(m[6]) + Number(m[7].padEnd(3, '0')) / 1000
}

/**
 * Parses SRT and WebVTT subtitles.
 * @param {string} content
 * @returns {CaptionPhrase[]}
 */
export function parseSubtitles(content) {
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const blocks = text.split(/\n{2,}/)
  const phrases = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '')
    if (lines.length === 0) continue
    const timeLineIndex = lines.findIndex((l) => l.includes('-->'))
    if (timeLineIndex === -1) continue
    const [rawStart, rawEnd] = lines[timeLineIndex].split('-->')
    const start = parseTimestamp(rawStart)
    const end = parseTimestamp(rawEnd ?? '')
    if (start === null || end === null || end <= start) continue
    const body = lines
      .slice(timeLineIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!body) continue
    phrases.push({ start, end, text: body, words: distributeWords(body, start, end) })
  }
  return phrases
}

/** Spreads words of a phrase evenly over its duration (used when no word timings exist). */
export function distributeWords(text, start, end) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  // Longer words get proportionally more time.
  const weights = words.map((w) => Math.max(2, w.length))
  const total = weights.reduce((a, b) => a + b, 0)
  let cursor = start
  return words.map((word, i) => {
    const span = ((end - start) * weights[i]) / total
    const wordStart = cursor
    cursor += span
    return { text: word, start: wordStart, end: i === words.length - 1 ? end : cursor }
  })
}

/**
 * Groups word timestamps (e.g. from speech recognition) into short phrases.
 *
 * @param {{ text: string, start: number, end: number }[]} words
 * @param {{ maxWords?: number, maxChars?: number, maxDuration?: number, maxGap?: number }} [options]
 * @returns {CaptionPhrase[]}
 */
export function wordsToPhrases(words, options = {}) {
  const maxWords = options.maxWords ?? 4
  const maxChars = options.maxChars ?? 28
  const maxDuration = options.maxDuration ?? 3
  const maxGap = options.maxGap ?? 0.6
  const phrases = []
  let current = []

  const flush = () => {
    if (current.length === 0) return
    phrases.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
      words: current.map((w) => ({ ...w })),
    })
    current = []
  }

  for (const word of words) {
    const clean = { text: word.text.trim(), start: word.start, end: Math.max(word.end, word.start + 0.05) }
    if (!clean.text) continue
    if (current.length > 0) {
      const last = current[current.length - 1]
      const chars = current.reduce((n, w) => n + w.text.length + 1, 0)
      const endsSentence = /[.!?]$/.test(last.text)
      const tooLong = current.length >= maxWords || chars + clean.text.length > maxChars
      const bigGap = clean.start - last.end > maxGap
      const tooSlow = clean.end - current[0].start > maxDuration
      if (endsSentence || tooLong || bigGap || tooSlow) flush()
    }
    current.push(clean)
  }
  flush()
  return phrases
}

/**
 * Turns pasted text into phrases with estimated timings, so it can be synced
 * by hand (or against a waveform) afterwards.
 *
 * @param {string} text
 * @param {{ start?: number, wordsPerPhrase?: number, wordsPerMinute?: number, totalDuration?: number }} [options]
 * @returns {CaptionPhrase[]}
 */
export function textToPhrases(text, options = {}) {
  const start = options.start ?? 0
  const maxWords = options.wordsPerPhrase ?? 4
  const wpm = options.wordsPerMinute ?? 150
  const chunks = []
  // Respect explicit line breaks, then split long lines into short phrases.
  for (const line of text.split(/\n+/)) {
    const words = line.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords))
  }
  if (chunks.length === 0) return []

  const totalWords = chunks.reduce((n, c) => n + c.length, 0)
  const naturalDuration = (totalWords / wpm) * 60
  const scale = options.totalDuration ? options.totalDuration / naturalDuration : 1
  let cursor = start
  return chunks.map((words) => {
    const duration = Math.max(0.6, ((words.length / wpm) * 60 + 0.15) * scale)
    const phrase = {
      start: cursor,
      end: cursor + duration,
      text: words.join(' '),
      words: distributeWords(words.join(' '), cursor, cursor + duration),
    }
    cursor += duration
    return phrase
  })
}

/** Splits a phrase before the word at `wordIndex`. */
export function splitPhrase(phrase, wordIndex) {
  if (wordIndex <= 0 || wordIndex >= phrase.words.length) return [phrase]
  const left = phrase.words.slice(0, wordIndex)
  const right = phrase.words.slice(wordIndex)
  return [
    { start: phrase.start, end: left[left.length - 1].end, text: left.map((w) => w.text).join(' '), words: left },
    { start: right[0].start, end: phrase.end, text: right.map((w) => w.text).join(' '), words: right },
  ]
}

/** Merges two consecutive phrases into one. */
export function mergePhrases(a, b) {
  return {
    start: Math.min(a.start, b.start),
    end: Math.max(a.end, b.end),
    text: `${a.text} ${b.text}`.trim(),
    words: [...a.words, ...b.words],
  }
}

/** Re-times the words of a phrase after its text or bounds changed. */
export function retimePhrase(phrase) {
  return { ...phrase, words: distributeWords(phrase.text, phrase.start, phrase.end) }
}

function formatSrtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const rest = ms % 1000
  const pad = (n, l = 2) => String(n).padStart(l, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`
}

/** Serializes phrases back to an SRT file. */
export function toSrt(phrases) {
  return phrases
    .map((p, i) => `${i + 1}\n${formatSrtTime(p.start)} --> ${formatSrtTime(p.end)}\n${p.text}\n`)
    .join('\n')
}
