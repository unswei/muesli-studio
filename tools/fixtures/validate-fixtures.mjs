#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const schemaPath = path.join(rootDir, 'schema', 'mbt.evt.v1.schema.json');
const fixtureFiles = [
  'tools/fixtures/minimal_run.jsonl',
  'tools/fixtures/planner_run.jsonl',
  'tools/fixtures/scheduler_run.jsonl',
];

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validate = ajv.compile(schema);

let hasErrors = false;

for (const fileName of fixtureFiles) {
  const filePath = path.join(rootDir, fileName);
  const raw = await readFile(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber]?.trim();
    if (!line) {
      continue;
    }

    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      hasErrors = true;
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      console.error(`${fileName}:${lineNumber + 1}: JSON parse error: ${message}`);
      continue;
    }

    const isValid = validate(event);
    if (!isValid) {
      hasErrors = true;
      const messages = (validate.errors ?? [])
        .map((entry) => `${entry.instancePath || '<root>'} ${entry.message ?? 'schema violation'}`)
        .join('; ');
      console.error(`${fileName}:${lineNumber + 1}: schema error: ${messages}`);
    }
  }
}

if (hasErrors) {
  process.exitCode = 1;
  console.error('Fixture schema validation failed.');
} else {
  console.log('All fixture logs conform to schema/mbt.evt.v1.schema.json');
}
