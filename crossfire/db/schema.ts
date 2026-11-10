import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('arena_rooms', {
  code: text('code').primaryKey(),
  state: text('state').notNull(),
  version: integer('version').notNull().default(0),
  touchedAt: integer('touched_at').notNull(),
});
