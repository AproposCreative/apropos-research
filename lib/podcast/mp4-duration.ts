/** Bounded ISO BMFF movie-header reader. No audio decoding, rewriting or provider calls. */
export type AudioRangeReader = (start: number, endInclusive: number) => Promise<Buffer>;
function atomHeader(bytes: Buffer, offset: number, fileEnd: number): { type: string; size: number; header: number } | null {
  if (offset + 8 > bytes.length) return null;
  let size = bytes.readUInt32BE(offset), header = 8;
  if (size === 1) {
    if (offset + 16 > bytes.length) return null;
    const long = bytes.readBigUInt64BE(offset + 8);
    if (long > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(long); header = 16;
  } else if (size === 0) size = fileEnd;
  if (size < header) return null;
  return { type: bytes.toString('ascii', offset + 4, offset + 8), size, header };
}
export function durationFromMovieAtom(bytes: Buffer): number | null {
  const root = atomHeader(bytes, 0, bytes.length);
  if (!root || root.type !== 'moov' || root.size > bytes.length) return null;
  for (let offset = root.header, count = 0; offset + 8 <= root.size && count++ < 1000;) {
    const atom = atomHeader(bytes, offset, root.size - offset);
    if (!atom || offset + atom.size > root.size) return null;
    if (atom.type === 'mvhd') {
      const body = bytes.subarray(offset + atom.header, offset + atom.size), version = body[0];
      if (version !== 0 && version !== 1 || body.length < (version === 1 ? 32 : 20)) return null;
      const scale = body.readUInt32BE(version === 1 ? 20 : 12);
      const ticks = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
      if (!scale || !Number.isSafeInteger(ticks) || ticks <= 0 || ticks === 0xffffffff) return null;
      const seconds = ticks / scale;
      return Number.isFinite(seconds) && seconds > 0 && seconds <= 7 * 86400 ? Math.max(1, Math.round(seconds)) : null;
    }
    offset += atom.size;
  }
  return null;
}
export async function readMp4Duration(size: number, read: AudioRangeReader): Promise<number | null> {
  if (!Number.isSafeInteger(size) || size < 16) return null;
  // Skip large mdat payloads by their declared offsets. Read at most 1 MiB of
  // moov metadata plus 64 small headers, including non-faststart legacy files.
  for (let offset = 0, count = 0; offset + 8 <= size && count++ < 64;) {
    const headerBytes = await read(offset, Math.min(size - 1, offset + 15));
    const atom = atomHeader(headerBytes, 0, size - offset);
    if (!atom || offset + atom.size > size) return null;
    if (atom.type === 'moov') {
      if (atom.size > 1024 * 1024) return null;
      return durationFromMovieAtom(await read(offset, offset + atom.size - 1));
    }
    offset += atom.size;
  }
  return null;
}
