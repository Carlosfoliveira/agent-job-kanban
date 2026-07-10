import { createApp } from "./app";
import { createDb } from "./db/client";

const db = createDb();
const app = createApp(db);

const port = 3001;

export default {
  port,
  fetch: app.fetch,
};

console.log(`Server listening on http://localhost:${port}`);
