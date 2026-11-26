// [Shared] Where the S1/S2 tests send their requests.
// LIVE_TESTING=true -> the running backend (npm run dev) on port 3000.
// Otherwise -> the app is started inside the test on a free port, so no server needs to be running.
export const mustRun = process.env.LIVE_TESTING === 'true';

let server;
export let API = 'http://localhost:3000/api/v1';

if (!mustRun) {
  process.env.NODE_ENV = 'test'; // index.js then skips app.listen and the SQS consumer
  const { app } = await import('../src/index.js');
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  API = `http://localhost:${server.address().port}/api/v1`;
}

export const stopBackend = () => server?.close();
