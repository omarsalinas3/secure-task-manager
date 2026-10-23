'use strict';

/**
 * Validates a request component with a Zod schema.
 *
 * @param {import('zod').ZodType} schema - Schema to apply.
 * @param {'body'|'query'|'params'} key - Request component to validate.
 * @returns {import('express').RequestHandler} Validation middleware.
 */
function validate(schema, key) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req[key] ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the submitted values.',
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    // Express 5 exposes req.query through a getter, so redefine it rather than assign.
    Object.defineProperty(req, key, {
      value: parsed.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

module.exports = { validate };
