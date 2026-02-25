import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8080';

// Headers that must not be forwarded between proxied connections
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

async function handler(
  request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const path = params.path.join('/');
  const { search } = new URL(request.url);
  const targetUrl = `${API_URL}/${path}${search}`;

  const forwardHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  });

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: hasBody ? request.body : undefined,
      // Node.js fetch requires duplex option when forwarding a streaming body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(hasBody ? ({ duplex: 'half' } as any) : {}),
    });
  } catch (error) {
    console.error(`Failed to proxy ${targetUrl}`, error);
    return NextResponse.json(
      { error: 'Failed to reach API' },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
export const OPTIONS = handler;
