CREATE TABLE `arena_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`touched_at` integer NOT NULL
);
