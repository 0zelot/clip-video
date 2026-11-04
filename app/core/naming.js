/**
 * Project naming: every project gets a name that no other project on this
 * device uses, so they can always be told apart in the list.
 */

/**
 * Returns `name`, or `name (2)`, `name (3)`… - the first one not in `existing`
 * (case-insensitive, ignoring surrounding whitespace).
 *
 * @param {string} name
 * @param {Iterable<string>} existing
 * @param {string} [fallback]
 */
export function uniqueName(name, existing, fallback = 'Untitled project') {
  const wanted = (name ?? '').trim().replace(/\s+/g, ' ') || fallback
  const taken = new Set()
  for (const n of existing) if (typeof n === 'string') taken.add(n.trim().toLowerCase())
  if (!taken.has(wanted.toLowerCase())) return wanted
  const match = /^(.*?) \((\d+)\)$/.exec(wanted)
  const stem = match ? match[1] : wanted
  let n = match ? Number(match[2]) + 1 : 2
  while (taken.has(`${stem} (${n})`.toLowerCase())) n++
  return `${stem} (${n})`
}

/**
 * A readable default name for a new project, e.g. `Short · 4 Nov 14:32`.
 * @param {{ width: number, height: number }} [format]
 * @param {Date} [date]
 */
export function defaultProjectName(format, date = new Date()) {
  const kind = !format ? 'Project' : format.height > format.width ? 'Short' : format.width > format.height ? 'Video' : 'Square'
  const pad = (n) => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${kind} · ${date.getDate()} ${months[date.getMonth()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
