# OfficeOurs

Cloud platform where instructors publish office-hour slots and students request, track and attend meetings, with AI help for FAQs and QR check-in.

**Live demo:** https://officeours.vercel.app

Built for **Intro to Cloud Computing (25CSCI37H)**, The British University in Egypt.

## Team and services
| Student | ID | Service | AWS services (on Floci) |
|---|---|---|---|
| Judy Tarek | 241339 | S1 Scheduling & Auth | DynamoDB, Lambda, EventBridge Scheduler, API Gateway, IAM |
| Moheeb Abusamra | 248690 | S2 Requests, FAQ, Notifications & AI | SNS, S3, Lambda, API Gateway, IAM |
| Ahmed Ellebishy | 244690 | S3 Queue, QR & History | SQS (+ dead-letter queue), S3, SES, Lambda, IAM |

| Service | Backend | Frontend |
|---|---|---|
| S1 | `server/src/services/scheduling`, `server/src/services/auth` | `client/src/pages/scheduling` |
| S2 | `server/src/services/requests` | `client/src/pages/requests` |
| S3 | `server/src/services/queue` | `client/src/pages/queue` |

## Tech stack
- **Frontend:** React 19, Vite, React Router, Lucide icons
- **Backend:** Node.js, Express 5 (ES modules)
- **Database and auth data:** Supabase (Postgres)
- **External APIs:** Google Gemini (FAQ ideas and duplicate checks), Brevo (emails), Calendarific (Egypt holidays)
- **Cloud:** Floci (AWS emulator in Docker) and Vercel

## Architecture
The same code runs in two deployments:

| | Floci (AWS path) | Vercel (public) |
|---|---|---|
| Frontend | S3 bucket `officeours-web` | Vercel static hosting |
| API | API Gateway `officeours-api` with 3 Lambdas (scheduling, requests, queue) | One Vercel Function (`api/index.js`) running the Express app |
| "Request confirmed" event | SNS topic, then SQS queue, then the queue worker | Handled inside the server (no AWS) |
| QR codes, AI log | Stored in S3 buckets | Not stored (QR is still emailed) |
| Database | Supabase | Supabase (same project) |

When `AWS_ENDPOINT_URL` is not set, every AWS step is skipped and events are handled in-process, which is how Vercel and plain local dev run.

## Run locally
Requires Node.js 20.19+ or 22.12+ (Vite 8).
1. `npm run install:all`
2. Copy `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`, then fill in the values (see below).
3. In the Supabase SQL Editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
4. `npm run dev`. The client runs on http://localhost:5173 and the server on http://localhost:3000.

Test accounts from the seed: students `241339`, `248690` and instructors `I-1001`, `I-1002`. Ask the team for the password. A new user activates an ID from the seed on the Register page.

## Run on Floci (AWS emulator)
Requires Docker Desktop.
1. `docker compose up -d` starts Floci on http://localhost:4566.
2. `npm run floci:setup --prefix server` creates every bucket, queue, topic, table, role, Lambda and API route. It is safe to run again.
3. Copy the values it prints (`AWS_ENDPOINT_URL`, `SQS_QUEUE_URL`, `SNS_TOPIC_ARN`, ...) into `server/.env`.
4. `npm run deploy:floci --prefix server` deploys the Lambdas and uploads the built frontend.
5. Open http://localhost:4566/officeours-web/index.html

Floci keeps its data after a restart. Stop it with `docker compose stop`.

## Deploy on Vercel
`vercel.json` already sets the install command, the build, the output folder and the routing (`/api/*` goes to the Express function, every other path goes to `index.html`).
1. On vercel.com: **Add New > Project**, import this repo, Framework Preset **Other**, Root Directory `./`.
2. Add the environment variables marked "Vercel" in the table below. Leave out every `AWS_*`, `SNS_*`, `SQS_*` and `S3_*` variable.
3. Deploy, then set `CLIENT_URL` and `CHECKIN_BASE_URL` to the Vercel address and redeploy.
4. Check `https://<project>.vercel.app/api/v1/health` returns `{"data":{"status":"ok"}}`.

Every push to `main` redeploys automatically.

## Environment variables
**Server (`server/.env`)**
| Variable | Purpose | Local | Floci | Vercel |
|---|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Database access (server only) | yes | yes | yes |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI features | yes | yes | yes |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | QR and notification emails | yes | yes | yes |
| `CALENDARIFIC_API_KEY` | Egypt public holidays | yes | yes | yes |
| `APP_TIMEZONE` | `Africa/Cairo` | yes | yes | yes |
| `CLIENT_URL` | Frontend address(es) allowed by CORS | yes | yes | yes |
| `CHECKIN_BASE_URL` | Address the QR code opens (defaults to `CLIENT_URL`) | optional | set by `deploy:floci` | yes |
| `PORT` | Local server port (3000) | yes | | |
| `AWS_ENDPOINT_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Floci connection | | yes | |
| `S3_BUCKET`, `SQS_QUEUE_URL`, `QUEUE_LAMBDA_NAME`, `SES_SENDER_EMAIL`, `SNS_TOPIC_ARN`, `AI_LOG_BUCKET` | Floci resources | | yes | |
| `TEST_PASSWORD`, `TEST_STUDENT_ID`, `TEST_STUDENT_PASSWORD` | Jest tests | tests only | | |

**Client (`client/.env`)**
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API base URL (`http://localhost:3000/api/v1` locally, set automatically on Floci and Vercel) |
| `VITE_ROUTER`, `VITE_BASE` | Set automatically by `deploy:floci` for the S3 build |

Never commit `.env` files.

## Testing
- **Jest:** `npm test`. The scheduling and requests tests call the running backend, so start `npm run dev` first and set `TEST_PASSWORD` in `server/.env`.
- **Postman:** import `docs/postman/OfficeOurs-S2.postman_collection.json`, set `baseUrl` (local, Floci or Vercel API address) and `password`, then run the collection.
- **API contract:** `docs/openapi.yaml`. Database diagram: `docs/erd.png`.

## Project structure
```
api/            Vercel Function entry (exports the Express app)
client/         React app (pages per service, shared components, API clients)
server/
  src/services/ auth, scheduling, requests, queue (routes, validation, logic, db)
  src/shared/   auth middleware, errors, events, notifications, Lambda wrapper
  scripts/      Floci setup and deploy scripts
  tests/        Jest tests
supabase/       schema.sql and seed.sql
docs/           OpenAPI contract, ERD, Postman collection
docker-compose.yml   Floci
vercel.json          Vercel build and routing
```
