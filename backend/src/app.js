'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const { getAllowedOrigins } = require('./config');
const { logger } = require('./utils/logger');
const { httpError } = require('./utils/http-error');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');
const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const allowedOrigins = getAllowedOrigins();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '20kb' }));

app.use(cors({
  origin(origin, callback) {
    // No Origin can occur for native apps and local command-line clients.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(httpError(403, 'CORS_REJECTED', 'Origin not allowed.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(pinoHttp({
  logger,
  serializers: {
    req(request) {
      // Only method and path: no headers, bodies, or query strings (which may hold tokens).
      return { method: request.method, url: request.url.split('?')[0] };
    },
    res(response) {
      return { statusCode: response.statusCode };
    },
  },
}));

app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };
