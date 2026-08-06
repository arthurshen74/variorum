/**
 * [G1] The projection (DESIGN.md "LinkML Graph Viewer"): LinkML YAML in,
 * effective-slots graph out. Tests are the spec for normalization,
 * cardinality derivation, inverse pairing, and boundary handling.
 */
import { describe, expect, it } from 'vitest';

import { parseLinkmlSchema, type LinkmlGraph } from './linkml-model';

function parseOk(content: string): LinkmlGraph {
  const result = parseLinkmlSchema(content);
  if (!result.ok) throw new Error(`expected ok parse, got: ${result.error}`);
  return result.graph;
}

describe('[G1] parseLinkmlSchema — projection', () => {
  it('parses a minimal schema: one class, nothing else', () => {
    const graph = parseOk(`
id: https://example.org/pets
name: pets
classes:
  Person: {}
`);
    expect(graph.classes).toHaveLength(1);
    expect(graph.classes[0]).toMatchObject({ name: 'Person', slots: [] });
    expect(graph.enums).toEqual([]);
    expect(graph.relationships).toEqual([]);
    expect(graph.inheritance).toEqual([]);
    expect(graph.enumReferences).toEqual([]);
  });

  it('inline scalar attributes become rows with name and range', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      name:
        range: string
      age:
        range: integer
`);
    expect(graph.classes[0]?.slots).toEqual([
      { name: 'name', range: 'string', cardinality: '0..1' },
      { name: 'age', range: 'integer', cardinality: '0..1' },
    ]);
  });

  it('derives cardinality from required and multivalued', () => {
    const graph = parseOk(`
classes:
  C:
    attributes:
      a:
        range: string
      b:
        range: string
        required: true
      c:
        range: string
        multivalued: true
      d:
        range: string
        required: true
        multivalued: true
`);
    const byName = Object.fromEntries(
      (graph.classes[0]?.slots ?? []).map((s) => [s.name, s.cardinality]),
    );
    expect(byName).toEqual({ a: '0..1', b: '1', c: '0..*', d: '1..*' });
  });

  it('a class-range attribute becomes a relationship, not a row', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      pets:
        range: Dog
        multivalued: true
  Dog: {}
`);
    expect(graph.classes.find((c) => c.name === 'Person')?.slots).toEqual([]);
    expect(graph.relationships).toEqual([
      {
        fromClass: 'Person',
        slotName: 'pets',
        toClass: 'Dog',
        cardinality: '0..*',
      },
    ]);
  });

  it('an enum-range attribute is both a row and an enum reference', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      status:
        range: PersonStatus
enums:
  PersonStatus:
    permissible_values:
      ALIVE: {}
      DEAD: {}
`);
    expect(graph.classes[0]?.slots).toEqual([
      { name: 'status', range: 'PersonStatus', cardinality: '0..1' },
    ]);
    expect(graph.enumReferences).toEqual([
      { fromClass: 'Person', slotName: 'status', enumName: 'PersonStatus' },
    ]);
  });

  it('an unknown range name is tolerated as a scalar row', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      thing:
        range: SomethingUndeclared
`);
    expect(graph.classes[0]?.slots).toEqual([
      { name: 'thing', range: 'SomethingUndeclared', cardinality: '0..1' },
    ]);
    expect(graph.relationships).toEqual([]);
    expect(graph.enumReferences).toEqual([]);
  });

  it('top-level slots referenced from a class resolve to effective slots', () => {
    const graph = parseOk(`
slots:
  name:
    range: string
    required: true
classes:
  Person:
    slots:
      - name
`);
    expect(graph.classes[0]?.slots).toEqual([
      { name: 'name', range: 'string', cardinality: '1' },
    ]);
  });

  it('slot_usage merges over the referenced top-level slot definition', () => {
    const graph = parseOk(`
slots:
  name:
    range: string
classes:
  Person:
    slots:
      - name
    slot_usage:
      name:
        required: true
`);
    expect(graph.classes[0]?.slots).toEqual([
      { name: 'name', range: 'string', cardinality: '1' },
    ]);
  });

  it('inline attributes and referenced slots coexist on one class', () => {
    const graph = parseOk(`
slots:
  id:
    range: string
classes:
  Person:
    slots:
      - id
    attributes:
      age:
        range: integer
`);
    const names = graph.classes[0]?.slots.map((s) => s.name).sort();
    expect(names).toEqual(['age', 'id']);
  });

  it('is_a yields an inheritance edge and does NOT materialize parent slots', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      name:
        range: string
  Student:
    is_a: Person
    attributes:
      school:
        range: string
`);
    expect(graph.inheritance).toEqual([
      { child: 'Student', parent: 'Person', kind: 'is_a' },
    ]);
    expect(
      graph.classes.find((c) => c.name === 'Student')?.slots.map((s) => s.name),
    ).toEqual(['school']);
  });

  it('each mixin yields a mixin inheritance edge', () => {
    const graph = parseOk(`
classes:
  HasAge: {}
  HasName: {}
  Person:
    mixins:
      - HasAge
      - HasName
`);
    expect(graph.inheritance).toEqual([
      { child: 'Person', parent: 'HasAge', kind: 'mixin' },
      { child: 'Person', parent: 'HasName', kind: 'mixin' },
    ]);
  });

  it('a mutual inverse pair collapses to one relationship, lexicographic direction', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      pets:
        range: Dog
        multivalued: true
        inverse: owner
  Dog:
    attributes:
      owner:
        range: Person
        inverse: pets
`);
    // ('Dog', 'owner') sorts before ('Person', 'pets') — Dog emits the edge.
    expect(graph.relationships).toEqual([
      {
        fromClass: 'Dog',
        slotName: 'owner',
        toClass: 'Person',
        cardinality: '0..1',
        inverseSlotName: 'pets',
      },
    ]);
  });

  it('a dangling inverse (named partner absent) stays an ordinary relationship', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      pets:
        range: Dog
        multivalued: true
        inverse: owner
  Dog: {}
`);
    expect(graph.relationships).toEqual([
      {
        fromClass: 'Person',
        slotName: 'pets',
        toClass: 'Dog',
        cardinality: '0..*',
      },
    ]);
  });

  it('an asymmetric inverse (one side silent) stays two ordinary relationships', () => {
    const graph = parseOk(`
classes:
  Person:
    attributes:
      pets:
        range: Dog
        inverse: owner
  Dog:
    attributes:
      owner:
        range: Person
`);
    expect(graph.relationships).toHaveLength(2);
    for (const rel of graph.relationships) {
      expect(rel.inverseSlotName).toBeUndefined();
    }
  });

  it('enums parse with their permissible values', () => {
    const graph = parseOk(`
enums:
  Status:
    permissible_values:
      ACTIVE:
      RETIRED:
`);
    expect(graph.enums).toEqual([
      { name: 'Status', permissibleValues: ['ACTIVE', 'RETIRED'] },
    ]);
  });
});

describe('[G1] parseLinkmlSchema — boundaries', () => {
  it('unparseable YAML yields ok: false with a message', () => {
    const result = parseLinkmlSchema('classes: {\n  unclosed');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('valid YAML with a non-map root yields ok: false', () => {
    const result = parseLinkmlSchema('- just\n- a\n- list\n');
    expect(result.ok).toBe(false);
  });

  it('a valid map with no classes is an empty graph, not an error', () => {
    const result = parseLinkmlSchema('id: https://example.org/x\nname: x\n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.classes).toEqual([]);
      expect(result.graph.enums).toEqual([]);
    }
  });

  it('hostile keys neither crash nor pollute prototypes', () => {
    const result = parseLinkmlSchema(`
classes:
  __proto__:
    attributes:
      constructor:
        range: string
`);
    expect(result.ok).toBe(true);
    const probe = {} as Record<string, unknown>;
    expect(probe.attributes).toBeUndefined();
    expect(probe.constructor).toBe(Object);
  });

  it('parsing the same input twice gives deeply equal graphs', () => {
    const content = `
classes:
  Person:
    attributes:
      name:
        range: string
      pets:
        range: Dog
        multivalued: true
  Dog:
    is_a: Person
enums:
  Status:
    permissible_values:
      A: {}
`;
    expect(parseOk(content)).toEqual(parseOk(content));
  });
});
