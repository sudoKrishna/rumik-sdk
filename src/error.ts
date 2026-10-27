
export interface APIErrorBody {
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface APIStatusErrorOptions {
  code?: string;
  requestId?: string;
  response?: APIErrorBody;
  retryAfter?: number;
}


export function RumikError(message: string): Error {
  const error = new Error(message);
  error.name = "RumikError";
  return error;
}

export function APIConnectionError(
  message = "Connection error.",
  cause?: unknown,
): Error & { cause?: unknown } {
  const error = RumikError(message) as Error & { cause?: unknown };

  error.name = "APIConnectionError";
  error.cause = cause;

  return error;
}

export function APITimeoutError(
  message = "Request timed out.",
  cause?: unknown,
): Error & { cause?: unknown } {
  const error = APIConnectionError(message, cause);
  error.name = "APITimeoutError";

  return error;
}


export function APIStatusError(
  message: string,
  statusCode: number,
  options: APIStatusErrorOptions = {},
): Error & {
  statusCode: number;
  code?: string;
  requestId?: string;
  response: APIErrorBody;
} {
  const error = RumikError(message) as Error & {
    statusCode: number;
    code?: string;
    requestId?: string;
    response: APIErrorBody;
  };

  error.name = "APIStatusError";
  error.statusCode = statusCode;
  error.code = options.code;
  error.requestId = options.requestId;
  error.response = options.response ?? {};

  return error;
}


export function BadRequestError(
  message: string,
  statusCode = 400,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "BadRequestError";
  return error;
}


export function AuthenticationError(
  message: string,
  statusCode = 401,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "AuthenticationError";
  return error;
}


export function PermissionDeniedError(
  message: string,
  statusCode = 403,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "PermissionDeniedError";
  return error;
}


export function NotFoundError(
  message: string,
  statusCode = 404,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "NotFoundError";
  return error;
}


export function UnprocessableEntityError(
  message: string,
  statusCode = 422,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "UnprocessableEntityError";
  return error;
}

export function RateLimitError(
  message: string,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, 429, options) as ReturnType<
    typeof APIStatusError
  > & { retryAfter?: number };

  error.name = "RateLimitError";
  error.retryAfter = options.retryAfter;

  return error;
}


export function InternalServerError(
  message: string,
  statusCode = 500,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "InternalServerError";
  return error;
}

export function ServiceUnavailableError(
  message: string,
  statusCode = 503,
  options: APIStatusErrorOptions = {},
) {
  const error = APIStatusError(message, statusCode, options);
  error.name = "ServiceUnavailableError";
  return error;
}


export function StreamError(
  message: string,
  cause?: unknown,
): Error & { cause?: unknown } {
  const error = RumikError(message) as Error & { cause?: unknown };

  error.name = "StreamError";
  error.cause = cause;

  return error;
}

export function errorForStatus(
  statusCode: number,
  message: string,
  options: APIStatusErrorOptions = {},
) {
  switch (statusCode) {
    case 400:
      return BadRequestError(message, statusCode, options);

    case 401:
      return AuthenticationError(message, statusCode, options);

    case 403:
      return PermissionDeniedError(message, statusCode, options);

    case 404:
      return NotFoundError(message, statusCode, options);

    case 422:
      return UnprocessableEntityError(message, statusCode, options);

    case 429:
      return RateLimitError(message, options);

    case 500:
      return InternalServerError(message, statusCode, options);

    case 503:
      return ServiceUnavailableError(message, statusCode, options);

    default:
      return APIStatusError(message, statusCode, options);
  }
}