#!/usr/bin/env node
const { randomBytes } = require("node:crypto");
process.stdout.write(`${randomBytes(32).toString("hex")}\n`);
