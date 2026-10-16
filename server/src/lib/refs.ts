import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Human-readable references: PREFIX-<base36 ms timestamp>-<4 random chars>
 * e.g. TRX-MVBEO2H2-TRI0, PRD-MVBEJ6AR-RE9H, REP-MVBELX7N-ZK4D, PO-MVBFAFC1-JZGT.
 */
export function makeRef(prefix: string): string {
  let rand = '';
  for (let i = 0; i < 4; i++) rand += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}
