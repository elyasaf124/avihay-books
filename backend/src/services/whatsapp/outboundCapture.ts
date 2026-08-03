/**
 * In-memory capture of outbound WhatsApp messages for integration tests.
 * Used when WHATSAPP_TEST_MOCK=true — no Graph API calls are made.
 */
export interface OutboundRecord {
  to: string;
  msgType: string;
  body: string;
  payload: Record<string, unknown>;
}

const records: OutboundRecord[] = [];

export function captureOutbound(record: OutboundRecord): void {
  records.push(record);
}

export function getOutboundRecords(): OutboundRecord[] {
  return [...records];
}

export function clearOutboundRecords(): void {
  records.length = 0;
}

export function lastOutbound(): OutboundRecord | undefined {
  return records[records.length - 1];
}

export function outboundBodies(): string[] {
  return records.map((r) => r.body);
}

export function hasOutboundContaining(substr: string): boolean {
  return records.some((r) => r.body.includes(substr));
}

export function lastNOutboundBodies(n: number): string[] {
  return records.slice(-n).map((r) => r.body);
}
