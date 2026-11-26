// [S1] Calendarific client: fetches Egypt holidays once per year and caches them in the DB (#15)
// [S1] Calendarific client: fetches Egypt holidays once per year and caches them in the DB (#15)
import { AppError } from '../../shared/errors.js';
 
// Asks Calendarific for Egypt's public holidays in one year.
// Returns a list like [{ date: '2026-01-07', name: 'Coptic Christmas Day' }, ...]
export async function fetchEgyptHolidays(year) {
  const url = `https://calendarific.com/api/v2/holidays?api_key=${process.env.CALENDARIFIC_API_KEY}&country=EG&year=${year}`;
 
  // 1. Call the API. If the internet or Calendarific is down, fetch() throws.
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    console.error('Calendarific could not be reached:', err.message);
    throw new AppError(502, 'EXTERNAL_API_ERROR', 'The holiday service is not reachable right now. Please try again later.');
  }
 
  // 2. A wrong key or a used-up monthly limit comes back as an error status
  const body = await response.json();
  if (!response.ok || body.meta.code !== 200) {
    console.error('Calendarific error:', body.meta);
    throw new AppError(502, 'EXTERNAL_API_ERROR', 'The holiday service returned an error. Please try again later.');
  }
 
  // 3. Keep only the official days off ("National holiday"), not observances or seasons.
  //    Two holidays can fall on the same date, so we keep only the first one per date.
  const holidays = [];
  for (const h of body.response.holidays) {
    const date = h.date.iso.slice(0, 10); // "2026-01-07T00:00:00+02:00" -> "2026-01-07"
    const isNational = h.type.includes('National holiday');
    const alreadyAdded = holidays.some(x => x.date === date);
    if (isNational && !alreadyAdded) {
      holidays.push({ date, name: h.name });
    }
  }
  return holidays;
}
 