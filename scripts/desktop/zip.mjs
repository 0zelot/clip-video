/**
 * Minimal zip reading and writing that keeps Unix file modes and symlinks -
 * what a macOS .app needs (executables, framework symlinks) and what the zip
 * tools on Windows lose. Entries copied from another zip keep their
 * compressed bytes untouched. No zip64: archives and entries stay under 4 GiB.
 */
import { closeSync, fstatSync, openSync, readSync, writeSync } from 'node:fs'
import { crc32, deflateRawSync } from 'node:zlib'

const S_IFLNK = 0o120000
const S_IFDIR = 0o040000
const S_IFREG = 0o100000
const MAX_U32 = 0xffffffff

export const fileMode = (entry) => ((entry.externalAttributes >>> 16) & 0xffff) || (entry.name.endsWith('/') ? S_IFDIR | 0o755 : S_IFREG | 0o644)
export const isSymlink = (entry) => (fileMode(entry) & 0o170000) === S_IFLNK

/** Opens a zip and lists its entries (from the central directory). */
export function openZip(file) {
  const fd = openSync(file, 'r')
  const size = fstatSync(fd).size
  const read = (length, position) => {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, position)
    return buffer
  }
  const tail = read(Math.min(size, 0xffff + 22), Math.max(0, size - 0xffff - 22))
  const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error(`${file} is not a zip file`)
  const count = tail.readUInt16LE(end + 10)
  const directorySize = tail.readUInt32LE(end + 12)
  const directoryOffset = tail.readUInt32LE(end + 16)
  if (count === 0xffff || directoryOffset === MAX_U32) throw new Error(`${file}: zip64 archives are not supported`)

  const directory = read(directorySize, directoryOffset)
  const entries = []
  for (let p = 0; entries.length < count; ) {
    if (directory.readUInt32LE(p) !== 0x02014b50) throw new Error(`${file}: broken central directory`)
    const nameLength = directory.readUInt16LE(p + 28)
    const extraLength = directory.readUInt16LE(p + 30)
    const commentLength = directory.readUInt16LE(p + 32)
    const flags = directory.readUInt16LE(p + 8)
    entries.push({
      name: directory.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLength),
      method: directory.readUInt16LE(p + 10),
      time: directory.readUInt16LE(p + 12),
      date: directory.readUInt16LE(p + 14),
      crc: directory.readUInt32LE(p + 16),
      compressedSize: directory.readUInt32LE(p + 20),
      size: directory.readUInt32LE(p + 24),
      externalAttributes: directory.readUInt32LE(p + 38),
      localOffset: directory.readUInt32LE(p + 42),
    })
    p += 46 + nameLength + extraLength + commentLength
  }

  return {
    entries,
    /** The entry's stored (still compressed) bytes. */
    raw(entry) {
      const header = read(30, entry.localOffset)
      if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`${file}: broken entry ${entry.name}`)
      return read(entry.compressedSize, entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28))
    },
    close: () => closeSync(fd),
  }
}

function dosTime(date = new Date()) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

export class ZipWriter {
  #fd
  #offset = 0
  #central = []
  #now = dosTime()

  constructor(file) {
    this.#fd = openSync(file, 'w')
  }

  #write(buffer) {
    writeSync(this.#fd, buffer, 0, buffer.length, this.#offset)
    this.#offset += buffer.length
  }

  /** Adds an entry whose data is already in its stored form (`method` 0 = stored, 8 = deflate). */
  addRaw({ name, method, crc, size, mode, time = this.#now.time, date = this.#now.date }, data) {
    const nameBytes = Buffer.from(name)
    if (this.#offset + 30 + nameBytes.length + data.length > MAX_U32) throw new Error('zip: archive over 4 GiB')
    const fields = Buffer.alloc(26)
    fields.writeUInt16LE(20, 0) // version needed
    fields.writeUInt16LE(0x0800, 2) // UTF-8 names
    fields.writeUInt16LE(method, 4)
    fields.writeUInt16LE(time, 6)
    fields.writeUInt16LE(date, 8)
    fields.writeUInt32LE(crc >>> 0, 10)
    fields.writeUInt32LE(data.length, 14)
    fields.writeUInt32LE(size, 18)
    fields.writeUInt16LE(nameBytes.length, 22)
    fields.writeUInt16LE(0, 24) // extra field
    const localOffset = this.#offset
    const signature = (value) => Buffer.from([0x50, 0x4b, value & 0xff, value >> 8])
    this.#write(Buffer.concat([signature(0x0403), fields, nameBytes]))
    this.#write(data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE((3 << 8) | 30, 4) // made by: Unix, zip 3.0
    fields.copy(central, 6, 0, 26)
    central.writeUInt16LE(0, 32) // comment
    central.writeUInt16LE(0, 34) // disk
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(((mode << 16) | ((mode & 0o170000) === S_IFDIR ? 0x10 : 0)) >>> 0, 38)
    central.writeUInt32LE(localOffset, 42)
    this.#central.push(central, nameBytes)
  }

  addFile(name, content, mode = 0o644) {
    const packed = deflateRawSync(content, { level: 9 })
    const stored = packed.length >= content.length
    this.addRaw({ name, method: stored ? 0 : 8, crc: crc32(content), size: content.length, mode: S_IFREG | mode }, stored ? content : packed)
  }

  addDirectory(name, mode = 0o755) {
    this.addRaw({ name: name.endsWith('/') ? name : `${name}/`, method: 0, crc: 0, size: 0, mode: S_IFDIR | mode }, Buffer.alloc(0))
  }

  close() {
    const directory = Buffer.concat(this.#central)
    const count = this.#central.length / 2
    if (count > 0xfffe) throw new Error('zip: too many entries')
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(count, 8)
    end.writeUInt16LE(count, 10)
    end.writeUInt32LE(directory.length, 12)
    end.writeUInt32LE(this.#offset, 16)
    this.#write(directory)
    this.#write(end)
    closeSync(this.#fd)
  }
}
