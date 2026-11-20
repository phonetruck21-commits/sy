export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'נדרשת התחברות') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'אין הרשאה לפעולה זו') => new HttpError(403, 'forbidden', msg);
export const notFound = (msg = 'לא נמצא') => new HttpError(404, 'not_found', msg);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
export const tooMany = (msg: string) => new HttpError(429, 'too_many_requests', msg);
