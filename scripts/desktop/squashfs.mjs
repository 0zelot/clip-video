/**
 * A small SquashFS 4.0 writer (gzip) - just enough for an AppImage: regular
 * files, directories and symlinks, everything owned by root.
 *
 * electron-builder packs AppImages with the native `mksquashfs`, which only
 * exists for Linux and macOS. On Windows `useBuiltInMksquashfs()` routes that
 * call here instead. Windows files carry no Unix permissions, so ELF binaries
 * and scripts (`#!`) get 0755 and everything else 0644 - the same modes the
 * official Electron Linux build uses.
 *
 * Format: https://dr-emann.github.io/squashfs/
 */
import { closeSync, lstatSync, openSync, readSync, readdirSync, readlinkSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const BLOCK_SIZE = 128 * 1024
const BLOCK_LOG = 17
const METADATA_SIZE = 8192
const NO_FRAGMENT = 0xffffffff
const NO_TABLE = 0xffffffffffffffffn
const COMPRESSION_GZIP = 1
const FLAGS = 0x0010 /* no fragments */ | 0x0200 /* no xattrs */
const TYPE = { dir: 1, file: 2, symlink: 3 }
const MAX_U32 = 0xffffffff

const compress = (data) => deflateSync(data, { level: 9 })
const byName = (a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name))

/** Packs bytes into compressed 8 KiB metadata blocks (inode, directory and id tables). */
class MetadataWriter {
  #blocks = []
  #written = 0
  #pending = Buffer.alloc(0)

  /** Where the next byte lands: block start (relative to the table) and offset inside that block. */
  position() {
    return { block: this.#written, offset: this.#pending.length }
  }

  write(data) {
    this.#pending = Buffer.concat([this.#pending, data])
    while (this.#pending.length >= METADATA_SIZE) {
      this.#flush(this.#pending.subarray(0, METADATA_SIZE))
      this.#pending = this.#pending.subarray(METADATA_SIZE)
    }
  }

  #flush(chunk) {
    const packed = compress(chunk)
    const stored = packed.length >= chunk.length
    const body = stored ? Buffer.from(chunk) : packed
    const header = Buffer.alloc(2)
    header.writeUInt16LE(body.length | (stored ? 0x8000 : 0))
    this.#blocks.push(header, body)
    this.#written += 2 + body.length
  }

  finish() {
    if (this.#pending.length > 0) this.#flush(this.#pending)
    this.#pending = Buffer.alloc(0)
    return Buffer.concat(this.#blocks)
  }
}

function isExecutable(path, size) {
  if (size < 2) return false
  const head = Buffer.alloc(4)
  const fd = openSync(path, 'r')
  try {
    readSync(fd, head, 0, 4, 0)
  } finally {
    closeSync(fd)
  }
  return head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || (head[0] === 0x23 && head[1] === 0x21)
}

function scan(path, name) {
  const stat = lstatSync(path)
  const mtime = Math.floor(stat.mtimeMs / 1000)
  if (stat.isSymbolicLink()) return { kind: 'symlink', name, mtime, target: readlinkSync(path).replaceAll('\\', '/') }
  if (stat.isDirectory()) {
    const children = readdirSync(path).map((child) => scan(join(path, child), child)).sort(byName)
    return { kind: 'dir', name, mtime, children }
  }
  if (!stat.isFile()) throw new Error(`squashfs: unsupported file type: ${path}`)
  if (stat.size > MAX_U32) throw new Error(`squashfs: files over 4 GiB are not supported: ${path}`)
  return { kind: 'file', name, mtime, path, size: stat.size, mode: isExecutable(path, stat.size) ? 0o755 : 0o644 }
}

/** Inode numbers in the order the inodes are written: children first, the directory after them. */
function numberInodes(node, next = { value: 1 }) {
  if (node.kind === 'dir') for (const child of node.children) numberInodes(child, next)
  node.inode = next.value++
  return next.value - 1
}

function inodeHeader(type, mode, mtime, inode) {
  const header = Buffer.alloc(16)
  header.writeUInt16LE(type, 0)
  header.writeUInt16LE(mode, 2)
  header.writeUInt16LE(0, 4) // uid index -> id table[0] = root
  header.writeUInt16LE(0, 6) // gid index
  header.writeUInt32LE(mtime >>> 0, 8)
  header.writeUInt32LE(inode, 12)
  return header
}

/**
 * Writes `sourceDir` as a SquashFS image into `outputFile`, starting `offset`
 * bytes into the file (room for the AppImage runtime, like `mksquashfs -offset`).
 */
export function writeSquashfs(sourceDir, outputFile, { offset = 0 } = {}) {
  const root = scan(sourceDir, '')
  const inodeCount = numberInodes(root)
  const inodes = new MetadataWriter()
  const directories = new MetadataWriter()
  const fd = openSync(outputFile, 'w')
  let position = 96 // after the superblock, relative to the image start

  const writeAt = (data) => {
    writeSync(fd, data, 0, data.length, offset + position)
    position += data.length
  }

  const writeFileData = (node) => {
    const start = position
    const sizes = []
    const source = openSync(node.path, 'r')
    try {
      const block = Buffer.alloc(BLOCK_SIZE)
      for (let done = 0; done < node.size; ) {
        const length = readSync(source, block, 0, Math.min(BLOCK_SIZE, node.size - done), done)
        if (length === 0) throw new Error(`squashfs: ${node.path} changed while packing`)
        const raw = block.subarray(0, length)
        const packed = compress(raw)
        const stored = packed.length >= raw.length
        writeAt(stored ? raw : packed)
        sizes.push(stored ? raw.length | 0x1000000 : packed.length)
        done += length
      }
    } finally {
      closeSync(source)
    }
    if (position > MAX_U32) throw new Error('squashfs: images over 4 GiB are not supported')
    return { start, sizes }
  }

  const writeListing = (entries) => {
    let bytes = 0
    for (let i = 0; i < entries.length; ) {
      const first = entries[i]
      let run = 1
      while (
        i + run < entries.length &&
        run < 256 &&
        entries[i + run].ref.block === first.ref.block &&
        Math.abs(entries[i + run].inode - first.inode) <= 32767
      ) run++
      const header = Buffer.alloc(12)
      header.writeUInt32LE(run - 1, 0)
      header.writeUInt32LE(first.ref.block, 4)
      header.writeUInt32LE(first.inode, 8)
      directories.write(header)
      bytes += 12
      for (const entry of entries.slice(i, i + run)) {
        const name = Buffer.from(entry.name)
        if (name.length === 0 || name.length > 256) throw new Error(`squashfs: bad file name "${entry.name}"`)
        const record = Buffer.alloc(8)
        record.writeUInt16LE(entry.ref.offset, 0)
        record.writeInt16LE(entry.inode - first.inode, 2)
        record.writeUInt16LE(entry.type, 4)
        record.writeUInt16LE(name.length - 1, 6)
        directories.write(Buffer.concat([record, name]))
        bytes += 8 + name.length
      }
      i += run
    }
    return bytes
  }

  /** Writes a node (data, then inode) and returns what its parent's listing needs. */
  const writeNode = (node, parentInode) => {
    if (node.kind === 'file') {
      const { start, sizes } = writeFileData(node)
      const ref = inodes.position()
      const body = Buffer.alloc(16 + sizes.length * 4)
      body.writeUInt32LE(start, 0)
      body.writeUInt32LE(NO_FRAGMENT, 4)
      body.writeUInt32LE(0, 8)
      body.writeUInt32LE(node.size, 12)
      sizes.forEach((size, i) => body.writeUInt32LE(size >>> 0, 16 + i * 4))
      inodes.write(Buffer.concat([inodeHeader(TYPE.file, node.mode, node.mtime, node.inode), body]))
      return { ref, type: TYPE.file }
    }
    if (node.kind === 'symlink') {
      const target = Buffer.from(node.target)
      const ref = inodes.position()
      const body = Buffer.alloc(8)
      body.writeUInt32LE(1, 0)
      body.writeUInt32LE(target.length, 4)
      inodes.write(Buffer.concat([inodeHeader(TYPE.symlink, 0o777, node.mtime, node.inode), body, target]))
      return { ref, type: TYPE.symlink }
    }
    const entries = node.children.map((child) => ({ name: child.name, inode: child.inode, ...writeNode(child, node.inode) }))
    const listing = directories.position()
    const listingSize = writeListing(entries)
    if (listingSize + 3 > 0xffff) throw new Error('squashfs: directory too large for a basic directory inode')
    const ref = inodes.position()
    const body = Buffer.alloc(16)
    body.writeUInt32LE(listing.block, 0)
    body.writeUInt32LE(2 + node.children.filter((c) => c.kind === 'dir').length, 4)
    body.writeUInt16LE(listingSize + 3, 8)
    body.writeUInt16LE(listing.offset, 10)
    body.writeUInt32LE(parentInode, 12)
    inodes.write(Buffer.concat([inodeHeader(TYPE.dir, 0o755, node.mtime, node.inode), body]))
    return { ref, type: TYPE.dir }
  }

  try {
    const rootRef = writeNode(root, inodeCount + 1).ref
    const inodeTableStart = position
    writeAt(inodes.finish())
    const directoryTableStart = position
    writeAt(directories.finish())
    const fragmentTableStart = position // no fragments: an empty table
    const ids = new MetadataWriter()
    ids.write(Buffer.alloc(4)) // the only owner: uid/gid 0
    const idBlockStart = position
    writeAt(ids.finish())
    const idTableStart = position
    const idIndex = Buffer.alloc(8)
    idIndex.writeBigUInt64LE(BigInt(idBlockStart))
    writeAt(idIndex)
    const bytesUsed = position

    // mksquashfs pads the image to 4 KiB (loop devices read whole pages).
    const padding = (4096 - ((offset + bytesUsed) % 4096)) % 4096
    if (padding) writeAt(Buffer.alloc(padding))

    const superblock = Buffer.alloc(96)
    superblock.writeUInt32LE(0x73717368, 0) // "hsqs"
    superblock.writeUInt32LE(inodeCount, 4)
    superblock.writeUInt32LE(Math.floor(Date.now() / 1000), 8)
    superblock.writeUInt32LE(BLOCK_SIZE, 12)
    superblock.writeUInt32LE(0, 16) // fragments
    superblock.writeUInt16LE(COMPRESSION_GZIP, 20)
    superblock.writeUInt16LE(BLOCK_LOG, 22)
    superblock.writeUInt16LE(FLAGS, 24)
    superblock.writeUInt16LE(1, 26) // ids
    superblock.writeUInt16LE(4, 28) // version 4.0
    superblock.writeUInt16LE(0, 30)
    superblock.writeBigUInt64LE((BigInt(rootRef.block) << 16n) | BigInt(rootRef.offset), 32)
    superblock.writeBigUInt64LE(BigInt(bytesUsed), 40)
    superblock.writeBigUInt64LE(BigInt(idTableStart), 48)
    superblock.writeBigUInt64LE(NO_TABLE, 56) // xattrs
    superblock.writeBigUInt64LE(BigInt(inodeTableStart), 64)
    superblock.writeBigUInt64LE(BigInt(directoryTableStart), 72)
    superblock.writeBigUInt64LE(BigInt(fragmentTableStart), 80)
    superblock.writeBigUInt64LE(NO_TABLE, 88) // export table
    writeSync(fd, superblock, 0, 96, offset)
    return { inodes: inodeCount, bytes: bytesUsed }
  } finally {
    closeSync(fd)
  }
}

/**
 * Makes electron-builder use `writeSquashfs` wherever it would run `mksquashfs`.
 * electron-builder looks the function up on the `builder-util` exports at call
 * time, so replacing that property is enough.
 */
export function useBuiltInMksquashfs() {
  const require = createRequire(import.meta.url)
  const appImageUtil = require.resolve('app-builder-lib/out/targets/appimage/appImageUtil.js')
  const builderUtil = createRequire(appImageUtil)('builder-util')
  const original = builderUtil.exec
  builderUtil.exec = async (file, args, options, ...rest) => {
    if (basename(file) !== 'mksquashfs') return original(file, args, options, ...rest)
    const [sourceDir, outputFile] = args
    const flag = (name) => args[args.indexOf(name) + 1]
    if (args.includes('-comp') && flag('-comp') !== 'gzip') {
      throw new Error(`The built-in mksquashfs only does gzip (asked for ${flag('-comp')}) - leave appImage.compression unset`)
    }
    writeSquashfs(sourceDir, outputFile, { offset: args.includes('-offset') ? Number(flag('-offset')) : 0 })
    return ''
  }
}
