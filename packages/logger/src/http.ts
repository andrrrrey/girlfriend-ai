import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

export function getRequestId(req: IncomingMessage, headerName = "x-request-id") {
  const h = headerName.toLowerCase();
  const fromHeader = (req.headers[h] as string | undefined)?.trim();
  return fromHeader && fromHeader.length > 0 ? fromHeader : randomUUID();
}

export function setResponseRequestId(
  res: ServerResponse,
  requestId: string,
  headerName = "x-request-id"
) {
  res.setHeader(headerName, requestId);
}
