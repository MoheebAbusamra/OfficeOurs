// [S1] Input rules for register/login (university ID and password); bad input -> 400
import { AppError } from '../../shared/errors.js';
 
// POST /auth/register body: { universityId, password }
export function validateRegister(body) {
  const details = [];
 
  if (typeof body.universityId !== 'string' || body.universityId.trim() === '') {
    details.push({ field: 'universityId', issue: 'required' });
  }
 
  if (typeof body.password !== 'string' || body.password === '') {
    details.push({ field: 'password', issue: 'required' });
  } else if (body.password.length < 8) {
    details.push({ field: 'password', issue: 'must be at least 8 characters' });
  }
 
  // If anything is wrong, stop here with 400 and the list of fields
  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', details);
  }
}
 
// POST /auth/login body: { universityId, password }
export function validateLogin(body) {
  const details = [];
 
  if (typeof body.universityId !== 'string' || body.universityId.trim() === '') {
    details.push({ field: 'universityId', issue: 'required' });
  }
 
  if (typeof body.password !== 'string' || body.password === '') {
    details.push({ field: 'password', issue: 'required' });
  }
 
  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', details);
  }
}
 