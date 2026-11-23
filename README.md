# OfficeOurs

Cloud platform where instructors publish office-hour slots and students request, track and attend meetings.

## Run locally
1. `npm run install:all`
2. Copy `client/.env.example` -> `client/.env` and `server/.env.example` -> `server/.env`, then fill in the values
3. Run `supabase/schema.sql` then `supabase/seed.sql` in the Supabase SQL Editor
4. `npm run dev` (client on http://localhost:5173, server on http://localhost:3000)

## Services
| Service | Owner | Backend | Frontend |
|---|---|---|---|
| S1 Scheduling & Notifications | TBD | server/src/services/scheduling | client/src/pages/scheduling |
| S2 Requests & FAQ | TBD | server/src/services/requests | client/src/pages/requests |
| S3 Queue, QR & History | TBD | server/src/services/queue | client/src/pages/queue |


