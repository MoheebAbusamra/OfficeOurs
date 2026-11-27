// AppError class + global error handler that returns the standard { error: { code, message, details } } format

// Throw this anywhere: throw new AppError(409, 'QUEUE_EMPTY', 'Nobody is waiting in this queue')
export class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Shortcuts for the common cases
export const badRequest = (message, details = []) => new AppError(400, 'VALIDATION_ERROR', message, details);
export const forbidden = (message = 'You are not allowed to do this') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new AppError(409, code, message);

// Mounted after all routers: unknown URL -> 404 in the standard format
export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}`, details: [] } });
}

// Mounted last: turns any thrown error into the standard JSON shape, so the app never crashes on bad input
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // Broken JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON', details: [] } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Please try again.', details: [] } });
}
