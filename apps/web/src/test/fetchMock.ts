import { vi } from 'vitest';

export type FetchSpy = ReturnType<typeof mockFetch>;

/**
 * Replaces `fetch` and captures the requests the app makes.
 *
 * The unit tests stub the network rather than the API client, so they assert the request
 * that actually leaves the browser — URL, method, body and the `Idempotency-Key` header.
 * Stubbing the client instead would let a form pass while sending the wrong request.
 */
export function mockFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => handler(String(input), init));
}

/** Answers every request with the same JSON body. */
export function mockFetchOnceJson(body: unknown, status = 200): FetchSpy {
  return mockFetch(() => Promise.resolve(jsonResponse(body, status)));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
}

/** The last request the app made, or a failure that says none was made. */
export function lastRequest(spy: FetchSpy): CapturedRequest {
  const call = spy.mock.calls.at(-1);
  if (call === undefined) throw new Error('fetch was never called');
  const [input, init] = call;
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: init?.body,
  };
}

/** The JSON body of the last request, parsed. */
export function lastJsonBody(spy: FetchSpy): unknown {
  const { body } = lastRequest(spy);
  if (typeof body !== 'string') throw new Error('last request did not carry a JSON body');
  return JSON.parse(body);
}

/** The multipart body of the last request. */
export function lastFormData(spy: FetchSpy): FormData {
  const { body } = lastRequest(spy);
  if (!(body instanceof FormData)) throw new Error('last request did not carry a FormData body');
  return body;
}
