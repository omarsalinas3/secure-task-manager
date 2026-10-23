'use strict';

const { PrismaClient } = require('@prisma/client');

/** Single Prisma client shared by all repositories. */
const prisma = new PrismaClient();

module.exports = { prisma };
