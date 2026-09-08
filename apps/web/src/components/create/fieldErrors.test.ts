import { describe, expect, it } from 'vitest';

import { ApiError } from '../../api/errors';
import { toCreateErrors } from './fieldErrors';

describe('toCreateErrors', () => {
  it("splits FastAPI's body paths into base fields and payload fields", () => {
    const errors = toCreateErrors(
      new ApiError(422, [
        { loc: ['body', 'title'], msg: 'Field required', type: 'missing' },
        { loc: ['body', 'payload', 'amount'], msg: 'Input should be greater than 0', type: 'gt' },
      ]),
    );

    expect(errors.base).toEqual({ title: 'Field required' });
    expect(errors.payload).toEqual({ amount: 'Input should be greater than 0' });
    expect(errors.general).toBeNull();
  });

  it('handles the unprefixed paths the service raises when it re-validates a payload', () => {
    const errors = toCreateErrors(
      new ApiError(422, [
        { loc: ['currency'], msg: 'String should match pattern', type: 'pattern' },
      ]),
    );

    expect(errors.payload).toEqual({ currency: 'String should match pattern' });
    expect(errors.base).toEqual({});
  });

  it('attributes an array item error to the array field', () => {
    const errors = toCreateErrors(
      new ApiError(422, [{ loc: ['checklist', 0], msg: 'Input should be a string', type: 'x' }]),
    );

    expect(errors.payload).toEqual({ checklist: 'Input should be a string' });
  });

  it('reports a string detail as a general message, not against a field', () => {
    const errors = toCreateErrors(new ApiError(409, 'action is already completed'));

    expect(errors.general).toBe('action is already completed');
    expect(errors.base).toEqual({});
    expect(errors.payload).toEqual({});
  });

  it('reports a network failure as a general message', () => {
    const errors = toCreateErrors(new Error('Failed to fetch'));
    expect(errors.general).toBe('Failed to fetch');
  });

  it('keeps an entry it cannot attribute to any field', () => {
    const errors = toCreateErrors(
      new ApiError(422, [{ loc: ['body'], msg: 'Input should be an object', type: 'x' }]),
    );

    expect(errors.general).toBe('Input should be an object');
  });
});
