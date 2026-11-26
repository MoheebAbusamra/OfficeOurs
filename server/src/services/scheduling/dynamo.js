// [S1] DynamoDB on Floci: the holidays cache (table "officeours-holidays", one item per holiday)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
 
// The table name. floci-setup.js creates the table with this name.
export const HOLIDAYS_TABLE = 'officeours-holidays';
 
// The connection to DynamoDB on Floci (http://localhost:4566).
// Floci accepts any keys, so 'test' is enough. Real AWS would need real keys.
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});
 
// "Document client" = lets us save and read plain objects like { year: 2026, date: '2026-01-07', name: '...' }
const dynamo = DynamoDBDocumentClient.from(client);
 
// All holidays of one year, sorted by date (DynamoDB sorts by the "date" key for us).
// Returns a list like [{ date: '2026-01-07', name: 'Coptic Christmas Day' }, ...]
export async function findHolidaysInDynamo(year) {
  const result = await dynamo.send(new QueryCommand({
    TableName: HOLIDAYS_TABLE,
    KeyConditionExpression: '#y = :year',
    ExpressionAttributeNames: { '#y': 'year' }, // "year" is a reserved word in DynamoDB, so we use #y in its place
    ExpressionAttributeValues: { ':year': year },
  }));
 
  const holidays = [];
  for (const item of result.Items) {
    holidays.push({ date: item.date, name: item.name });
  }
  return holidays;
}
 
// Saves the holidays of one year. Saving the same date again just replaces it (no duplicates).
export async function saveHolidaysInDynamo(year, holidays) {
  for (const h of holidays) {
    await dynamo.send(new PutCommand({
      TableName: HOLIDAYS_TABLE,
      Item: { year, date: h.date, name: h.name },
    }));
  }
}
 