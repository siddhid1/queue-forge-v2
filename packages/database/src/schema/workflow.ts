import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const workflowDefinitions = pgTable(
  "workflow_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1000 }),
    version: integer("version").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
    inputSchema: jsonb("input_schema").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [uniqueIndex("workflow_definitions_name_version_unique").on(table.name, table.version)],
);

export const workflowTaskDefinitions = pgTable(
  "workflow_task_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id),
    taskKey: varchar("task_key", { length: 100 }).notNull(),
    jobName: varchar("job_name", { length: 255 }).notNull(),
    priority: integer("priority").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    input: jsonb("input").notNull().default({}),
  },
  (table) => [
    uniqueIndex("workflow_tasks_definition_key_unique").on(table.workflowDefinitionId, table.taskKey),
    index("workflow_tasks_definition_idx").on(table.workflowDefinitionId),
  ],
);

export const workflowDependencies = pgTable(
  "workflow_dependencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowDefinitionId: uuid("workflow_definition_id")
      .notNull()
      .references(() => workflowDefinitions.id),
    upstreamTaskKey: varchar("upstream_task_key", { length: 100 }).notNull(),
    downstreamTaskKey: varchar("downstream_task_key", { length: 100 }).notNull(),
  },
  (table) => [
    uniqueIndex("workflow_dependencies_edge_unique").on(
      table.workflowDefinitionId,
      table.upstreamTaskKey,
      table.downstreamTaskKey,
    ),
    index("workflow_dependencies_downstream_idx").on(table.workflowDefinitionId, table.downstreamTaskKey),
  ],
);
