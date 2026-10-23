'use strict';

const { z } = require('zod');

/** Prisma cuid() identifiers: lowercase alphanumerics starting with "c". */
const cuid = () => z.string().regex(/^c[a-z0-9]{20,30}$/, 'Invalid identifier.');

/** Validates a new task payload. */
const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

/** Validates a partial task update. */
const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  completed: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required.',
});

/** Validates pagination, search, and filter query parameters. */
const listTasksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Cursor pagination: ID of the last task on the previous page (stable under inserts).
  cursor: cuid().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'pending', 'completed']).default('all'),
});

/** Validates the task ID route parameter. */
const taskIdParamSchema = z.object({ taskId: cuid() });

module.exports = { cuid, createTaskSchema, updateTaskSchema, listTasksSchema, taskIdParamSchema };
