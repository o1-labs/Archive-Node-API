import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// This file runs from build/tests/unit, so the built resolvers sit here.
const resolversPath = path.resolve(here, '../../src/resolvers.js');

/** Root query fields the schema exposes under the given environment. */
function queryFieldsWith(env: Record<string, string>): string[] {
  const script = `
    const { schema } = await import(${JSON.stringify(resolversPath)});
    console.log(JSON.stringify(Object.keys(schema.getQueryType().getFields())));
  `;
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { env: { ...process.env, ...env }, encoding: 'utf-8' }
  );
  return JSON.parse(out.trim()) as string[];
}

// resolvers.ts reads the flag once, at import, so each case needs its own
// process rather than a mutated process.env.
describe('zkappCommands gating', () => {
  test('is absent by default', () => {
    const fields = queryFieldsWith({ ENABLE_ZKAPP_COMMANDS_QUERY: '' });
    assert.ok(
      !fields.includes('zkappCommands'),
      'the range query must be opt-in, not on by default'
    );
    assert.ok(fields.includes('events'), 'other queries stay exposed');
  });

  test('appears when its own flag is set', () => {
    const fields = queryFieldsWith({ ENABLE_ZKAPP_COMMANDS_QUERY: 'true' });
    assert.ok(fields.includes('zkappCommands'));
  });

  // The point of the dedicated flag: block transaction detail and this range
  // query are separately priced, so one must not imply the other.
  test('ENABLE_BLOCK_TRANSACTION_DETAILS alone does not expose it', () => {
    const fields = queryFieldsWith({
      ENABLE_BLOCK_TRANSACTION_DETAILS: 'true',
      ENABLE_ZKAPP_COMMANDS_QUERY: '',
    });
    assert.ok(
      !fields.includes('zkappCommands'),
      'zkappCommands must not ride on ENABLE_BLOCK_TRANSACTION_DETAILS'
    );
  });

  // parseBoolean, not ad-hoc truthiness: the string "false" used to read true.
  test('the string "false" disables it', () => {
    const fields = queryFieldsWith({ ENABLE_ZKAPP_COMMANDS_QUERY: 'false' });
    assert.ok(!fields.includes('zkappCommands'));
  });
});
