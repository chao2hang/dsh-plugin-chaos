/** Browser base64 encoding of file bytes, chunked to stay under argument limits. */

/** Chunk size for String.fromCharCode spreads (32 KiB). */
const CHUNK_SIZE = 0x8000

/**
 * Encode one browser file's bytes as canonical base64.
 * @param file - the browser-picked file.
 * @returns the base64 encoding of the file's bytes.
 * @throws Error when the file cannot be read.
 */
export async function base64OfFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE))
  }
  return btoa(binary)
}
