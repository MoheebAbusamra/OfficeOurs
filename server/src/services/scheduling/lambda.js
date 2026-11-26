// [S1] AWS Lambda "officeours-holidays" (runs on Floci). Two jobs:
//   A. Called by API Gateway (GET /holidays?year=2026): returns the holidays, from DynamoDB or from Calendarific
//   B. Called by the daily EventBridge schedule: downloads this year's and next year's holidays again and saves them
// floci-setup.js packs this file (with the files it imports) into a zip and uploads it to Floci.
import { fetchEgyptHolidays } from './calendarific.js';
import { findHolidaysInDynamo, saveHolidaysInDynamo } from './dynamo.js';
import { saveHolidays } from './db.js';
 
export async function handler(event) {
  // A. A request from API Gateway always has "requestContext" (the details of the HTTP request).
  //    The daily schedule sends only { source: 'daily-schedule' }, so it goes to part B.
  if (event.requestContext) {
    const year = Number(event.queryStringParameters?.year);
    if (!year || year < 2000 || year > 2100) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields', details: [{ field: 'year', issue: 'must be a year like 2026' }] } }),
      };
    }
 
    try {
      // 1. Cache first. 2. Not there? Ask Calendarific and keep the result in DynamoDB
      let holidays = await findHolidaysInDynamo(year);
      if (holidays.length === 0) {
        holidays = await fetchEgyptHolidays(year);
        await saveHolidaysInDynamo(year, holidays);
      }
      console.log(`[S1 lambda] API Gateway: ${holidays.length} holidays for ${year}`);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: holidays }),
      };
    } catch (err) {
      console.error(`[S1 lambda] API Gateway failed: ${err.message}`);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { code: 'EXTERNAL_API_ERROR', message: 'The holiday service is not reachable right now. Please try again later.', details: [] } }),
      };
    }
  }
 
  // B. The daily schedule: refresh this year and next year (so January is ready before it starts)
  const thisYear = new Date().getFullYear();
  const result = [];
  for (const year of [thisYear, thisYear + 1]) {
    const holidays = await fetchEgyptHolidays(year);
 
    // Save in DynamoDB (the cloud cache) ...
    await saveHolidaysInDynamo(year, holidays);
 
    // ... and in Supabase, because the slot list for students reads the holidays from there
    const rows = [];
    for (const h of holidays) {
      rows.push({ holiday_date: h.date, name: h.name, year });
    }
    if (rows.length > 0) await saveHolidays(rows);
 
    result.push({ year, saved: holidays.length });
  }
  console.log(`[S1 lambda] daily sync done: ${JSON.stringify(result)}`);
  return { refreshed: result };
}
 