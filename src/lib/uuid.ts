/** UUIDv7 generator — time-sortable unique identifiers */
export function uuidv7(): string {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);

  // Set version 7
  randomBytes[0] = (randomBytes[0] & 0x0f) | 0x70;
  // Set variant to 10xx
  randomBytes[2] = (randomBytes[2] & 0x3f) | 0x80;

  const hexParts = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, '0'));

  return [
    timeHex.slice(0, 8),
    timeHex.slice(8, 12),
    hexParts.slice(0, 2).join(''),
    hexParts.slice(2, 4).join(''),
    hexParts.slice(4).join(''),
  ].join('-');
}
