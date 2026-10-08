import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildSchema,
  getNullableType,
  isListType,
  isNonNullType,
  isObjectType,
  type GraphQLOutputType,
} from 'graphql';

const schema = buildSchema(
  readFileSync(path.resolve(process.cwd(), 'schema.graphql'), 'utf-8')
);

// Lists whose elements may legitimately be null. Anything else must declare
// non-null elements: the resolvers never produce a null element, and the SDKs
// type them as non-null on the strength of this schema.
const NULLABLE_ELEMENTS_ALLOWED = new Set([
  // A null entry is an empty nullable state slot in the archive.
  'ZkappFieldArray.fields',
]);

function hasNullableElements(type: GraphQLOutputType): boolean {
  const list = getNullableType(type);
  return isListType(list) && !isNonNullType(list.ofType);
}

describe('list element nullability', () => {
  test('every output list declares non-null elements', () => {
    const offenders: string[] = [];
    for (const type of Object.values(schema.getTypeMap())) {
      if (!isObjectType(type) || type.name.startsWith('__')) continue;
      for (const field of Object.values(type.getFields())) {
        const name = `${type.name}.${field.name}`;
        if (
          hasNullableElements(field.type) &&
          !NULLABLE_ELEMENTS_ALLOWED.has(name)
        ) {
          offenders.push(`${name}: ${field.type.toString()}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('eventData and actionData stay nullable as a whole', () => {
    const outer = (typeName: string, fieldName: string) => {
      const type = schema.getType(typeName);
      assert.ok(isObjectType(type));
      return type.getFields()[fieldName].type;
    };
    assert.equal(isNonNullType(outer('EventOutput', 'eventData')), false);
    assert.equal(isNonNullType(outer('ActionOutput', 'actionData')), false);
  });
});
