// HTTP errors serialised as `{ message, error, statusCode }` (plus optional `errors` map for field validation).

const REASONS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public errors?: Record<string, string>,
  ) {
    super(message);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      error: this.code ?? REASONS[this.statusCode] ?? 'Error',
      statusCode: this.statusCode,
      ...(this.errors ? { errors: this.errors } : {}),
    };
  }
}

export const badRequest = (message: string, errors?: Record<string, string>) =>
  new HttpError(400, message, undefined, errors);
export const unauthorized = (message = 'Non authentifié') => new HttpError(401, message);
export const forbidden = (message = 'Accès refusé', code?: string) => new HttpError(403, message, code);
export const notFound = (what: string, id?: string) =>
  new HttpError(404, id ? `${what} with ID ${id} not found` : `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
