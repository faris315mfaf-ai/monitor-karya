import 'server-only'

import { crc32 } from 'node:zlib'

/**
 * Penulis arsip ZIP minimal (metode STORE, tanpa kompresi) untuk unduhan
 * beberapa PDF sekaligus. PDF berisi JPEG hampir tidak menyusut bila
 * dikompresi, jadi STORE cukup dan cepat. Nama berkas UTF-8 (bit 11).
 * Tanpa ZIP64: total < 4 GB dan < 65.535 berkas (unduhan kita jauh di bawahnya).
 */

export type ZipEntry = { name: string; data: Buffer; modified?: Date }

const UTF8 = 0x0800
const VERSION = 20

/** Tanggal & jam DOS menurut jam dinding WIB. */
function dosStamp(at: Date): { time: number; date: number } {
  const w = new Date(at.getTime() + 7 * 3_600_000)
  const year = Math.min(Math.max(w.getUTCFullYear(), 1980), 2107)
  return {
    time: (w.getUTCHours() << 11) | (w.getUTCMinutes() << 5) | Math.floor(w.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((w.getUTCMonth() + 1) << 5) | w.getUTCDate(),
  }
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data) >>> 0
    const { time, date } = dosStamp(e.modified ?? new Date())

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(VERSION, 4)
    local.writeUInt16LE(UTF8, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(e.data.length, 18)
    local.writeUInt32LE(e.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, e.data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(VERSION, 4)
    central.writeUInt16LE(VERSION, 6)
    central.writeUInt16LE(UTF8, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(date, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(e.data.length, 20)
    central.writeUInt32LE(e.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    // extra, komentar, nomor disk, atribut internal/eksternal = 0
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + e.data.length
  }
  const cdSize = centrals.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cdSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}
