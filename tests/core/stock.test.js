import { describe, expect, it } from 'vitest'
import { creditsText, parseCommonsPage, plainText, titleFromFileName } from '../../app/services/stock/stockLibrary'

const derivative = (height, type = 'video/webm; codecs="vp9, opus"') => ({
  src: `https://upload.wikimedia.org/x.${height}p.vp9.webm`,
  type,
  width: Math.round((height * 16) / 9),
  height,
})

const page = (videoinfo) => ({ pageid: 42, index: 1, title: 'File:Minecraft_Beta_Gameplay.webm', videoinfo: [videoinfo] })

describe('stock library', () => {
  it('turns a Commons page into a clip with a <=720p WebM download and credit', () => {
    const clip = parseCommonsPage(
      page({
        mime: 'video/webm',
        duration: 14.2,
        thumburl: 'https://upload.wikimedia.org/thumb.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Minecraft_Beta_Gameplay.webm',
        derivatives: [derivative(1080), derivative(240), derivative(360, 'video/quicktime; codecs="mp4v"'), derivative(720), derivative(480)],
        extmetadata: {
          Artist: { value: '<a href="//x">Xbox&nbsp;México</a>' },
          LicenseShortName: { value: 'CC BY 4.0' },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' },
        },
      }),
    )
    expect(clip).toMatchObject({
      id: 'commons:42',
      title: 'Minecraft Beta Gameplay',
      downloadUrl: 'https://upload.wikimedia.org/x.720p.vp9.webm',
      previewUrl: 'https://upload.wikimedia.org/x.240p.vp9.webm',
      height: 720,
      author: 'Xbox México',
      license: 'CC BY 4.0',
    })
  })

  it('skips clips that are too long, too short or have no WebM rendition', () => {
    const base = { mime: 'video/webm', derivatives: [derivative(480)], extmetadata: {} }
    expect(parseCommonsPage(page({ ...base, duration: 2 }))).toBeNull()
    expect(parseCommonsPage(page({ ...base, duration: 3600 }))).toBeNull()
    expect(parseCommonsPage(page({ ...base, duration: 20, derivatives: [derivative(360, 'video/quicktime')] }))).toBeNull()
    expect(parseCommonsPage(page({ ...base, mime: 'audio/ogg', duration: 20 }))).toBeNull()
    expect(parseCommonsPage({ pageid: 1, title: 'File:x.webm' })).toBeNull()
  })

  it('cleans titles and HTML metadata', () => {
    expect(titleFromFileName('File:Ocean__waves_at_dusk.ogv')).toBe('Ocean waves at dusk')
    expect(plainText('<span>Jane &amp; John</span>  <b>Doe</b>')).toBe('Jane & John Doe')
  })

  it('lists credits of stock assets only', () => {
    const text = creditsText([
      { name: 'own.mp4' },
      { name: 'a.webm', credit: { title: 'Waves', author: 'Jane', license: 'CC BY 4.0', url: 'https://c/w' } },
      { name: 'b.mp4', credit: { title: 'Earth', author: 'NASA', license: 'Public domain' } },
    ])
    expect(text).toBe('"Waves" - Jane, CC BY 4.0 (https://c/w)\n"Earth" - NASA, Public domain')
  })
})
