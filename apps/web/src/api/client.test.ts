import { describe, expect, it } from 'vitest';

import { makeTask } from '../test/factories';
import { lastJsonBody, lastRequest, mockFetch, mockFetchOnceJson } from '../test/fetchMock';
import { completeAction, getAction, IDEMPOTENCY_HEADER, listActions } from './client';
import { ApiError } from './errors';

describe('listActions', () => {
  it('asks for the whole queue when no filter is given', async () => {
    const spy = mockFetchOnceJson([]);
    await listActions();
    expect(lastRequest(spy).url).toMatch(/\/actions$/);
  });

  it('passes the status and type filters as query parameters', async () => {
    const spy = mockFetchOnceJson([]);
    await listActions({ status: 'pending', type: 'onboarding' });
    expect(lastRequest(spy).url).toMatch(/\/actions\?status=pending&type=onboarding$/);
  });
});

describe('getAction', () => {
  it('escapes the id it puts in the path', async () => {
    const spy = mockFetchOnceJson(makeTask('expense_approval'));
    await getAction('a b/c');
    expect(lastRequest(spy).url).toMatch(/\/actions\/a%20b%2Fc$/);
  });
});

describe('completeAction', () => {
  it('sends the payload as JSON with the idempotency key', async () => {
    const spy = mockFetchOnceJson(makeTask('expense_approval'));
    await completeAction('abc', { approved: true, comment: 'ok' }, 'key-1');

    const request = lastRequest(spy);
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(request.headers.get(IDEMPOTENCY_HEADER)).toBe('key-1');
    expect(lastJsonBody(spy)).toEqual({ approved: true, comment: 'ok' });
  });
});

describe('error mapping', () => {
  it('carries a string detail through as the message', async () => {
    mockFetchOnceJson({ detail: 'Idempotency-Key header is required' }, 400);

    await expect(listActions()).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Idempotency-Key header is required',
    });
  });

  it('flattens FastAPI 422 field errors into one readable line', async () => {
    mockFetchOnceJson(
      {
        detail: [
          { loc: ['body', 'completed_steps'], msg: 'List should have at least 1 item', type: 'x' },
          { loc: ['body', 'approved'], msg: 'Field required', type: 'missing' },
        ],
      },
      422,
    );

    const error = await listActions().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(
      'completed_steps: List should have at least 1 item; approved: Field required',
    );
  });

  it('falls back to the status line when the body is not JSON', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>oops</html>', { status: 502 })));

    await expect(listActions()).rejects.toMatchObject({ status: 502 });
  });
});
