'use strict';

const path = require('node:path');

// Load test-only settings; variables already set (for example by CI) take precedence.
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });
process.env.NODE_ENV = 'test';
