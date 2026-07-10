import { sql } from "drizzle-orm";
import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type ScoreBreakdown = Record<string, unknown>;

export const jobs = sqliteTable("jobs", {
  id: int("id").primaryKey({ autoIncrement: true }),
  linkedinJobId: text("linkedin_job_id").notNull().unique(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  workplaceType: text("workplace_type"),
  description: text("description"),
  url: text("url"),
  postedAt: text("posted_at"),
  status: text("status").notNull().default("inbox"),
  sortOrder: real("sort_order").notNull().default(0),
  score: real("score"),
  scoreBreakdown: text("score_breakdown", { mode: "json" }).$type<ScoreBreakdown>(),
  techTags: text("tech_tags", { mode: "json" }).$type<string[]>(),
  createdAt: text("created_at").default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").default(sql`(current_timestamp)`),
});

export const emails = sqliteTable("emails", {
  id: int("id").primaryKey({ autoIncrement: true }),
  jobId: int("job_id").references(() => jobs.id),
  gmailMessageId: text("gmail_message_id").notNull().unique(),
  gmailThreadId: text("gmail_thread_id"),
  subject: text("subject"),
  sender: text("sender"),
  snippet: text("snippet"),
  receivedAt: text("received_at"),
  seen: int("seen").notNull().default(0),
  classification: text("classification"),
  dismissed: int("dismissed").notNull().default(0),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});
