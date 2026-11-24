// [Shared] AppError class + global error handler that returns the standard { error: { code, message, details } } format
// Any route can do: throw new AppError(409, 'SLOT_OVERLAP', 'This overlaps one of your slots')

export class AppError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status; // HTTP status code, e.g. 400, 404, 409
    this.code = code; // short code the frontend can check, e.g. 'VALIDATION_ERROR'
    this.details = details; // field errors: [{ field: 'slotDate', issue: 'required' }]
  }
}

// Express sends every thrown error here (Express 5 also catches errors from async functions)
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // The body was not valid JSON (thrown by express.json())
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The request body is not valid JSON', details: [] } });
  }
  // Anything else is a bug: log it, but never crash and never show internals to the user
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on the server. Please try again.', details: [] } });
}
