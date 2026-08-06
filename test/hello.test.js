const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { greet } = require('../index.js');

describe('greet', () => {
  it('returns Hello, World! by default', () => {
    assert.equal(greet(), 'Hello, World!');
  });

  it('greets a custom name', () => {
    assert.equal(greet('NXRadar'), 'Hello, NXRadar!');
  });
});
