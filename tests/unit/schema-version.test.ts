import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { graphql } from 'graphql';
import { schema } from '../../src/resolvers.js';
import { SCHEMA_VERSION } from '../../src/schema-version.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// This file runs from build/tests/unit, so the built resolvers sit here.
const resolversPath = path.resolve(here, '../../src/resolvers.js');

describe('schemaVersion handshake', () => {
  test('is a MAJOR.MINOR string', () => {
    assert.match(
      SCHEMA_VERSION,
      /^\d+\.\d+$/,
      'the SDKs compare major and minor; a patch component would never match'
    );
  });

  test('the query returns the constant', async () => {
    const result = await graphql({ schema, source: '{ schemaVersion }' });
    assert.equal(result.errors, undefined);
    // graphql() returns a null-prototype object, so compare the field.
    assert.equal(result.data?.schemaVersion, SCHEMA_VERSION);
  });

  // The whole point of the field is that a client can always ask. A handshake
  // a deployment can switch off silently leaves the client guessing, which is
  // the state this field exists to end.
  test('survives ENABLED_QUERIES that names only one other query', () => {
    // resolvers.ts reads ENABLED_QUERIES once, at import, so this needs a
    // fresh process rather than a mutated process.env.
    const script = `
      const { schema } = await import(${JSON.stringify(resolversPath)});
      const fields = Object.keys(schema.getQueryType().getFields());
      console.log(JSON.stringify(fields));
    `;
    const out = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { env: { ...process.env, ENABLED_QUERIES: 'blocks' }, encoding: 'utf-8' }
    );
    const fields = JSON.parse(out.trim()) as string[];

    assert.ok(
      fields.includes('schemaVersion'),
      `schemaVersion was filtered out; the schema exposed ${fields.join(', ')}`
    );
    assert.ok(fields.includes('blocks'), 'the named query should be exposed');
    assert.ok(
      !fields.includes('events'),
      'an unnamed data query should still be filtered out'
    );
  });
});
