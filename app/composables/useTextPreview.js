import { fontStack } from '~/core/model/defaults'

/**
 * CSS approximation of a text/caption style, used for the small "Aa" preset
 * thumbnails (the real rendering happens on the canvas).
 * @param {import('~/core/model/types').TextStyle} style
 */
export function textPreviewStyle(style) {
  const css = {
    fontFamily: fontStack(style.fontFamily),
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    color: style.color,
    lineHeight: 1,
  }
  if (style.background?.opacity > 0) {
    css.background = style.background.color
  }
  if (style.gradientColor) {
    css.backgroundImage = `linear-gradient(${style.color}, ${style.gradientColor})`
    css.backgroundClip = 'text'
    css.WebkitBackgroundClip = 'text'
    css.color = 'transparent'
    if (style.background?.opacity > 0) css.background = undefined
  }
  if (style.outlineOnly) {
    css.color = 'transparent'
    css.WebkitTextStroke = `1px ${style.stroke?.color ?? '#fff'}`
  } else if (style.stroke?.width > 0) {
    css.WebkitTextStroke = `${Math.min(2, style.stroke.width * 12)}px ${style.stroke.color}`
    css.paintOrder = 'stroke fill'
  }
  if (style.shadow?.opacity > 0) {
    css.textShadow = `${style.shadow.offsetX * 14}px ${style.shadow.offsetY * 14}px ${style.shadow.blur * 14}px ${style.shadow.color}`
  }
  return css
}
