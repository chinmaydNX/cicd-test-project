const _ = require('lodash');
// Intentionally vulnerable (CVE-2021-3918, Critical) — for CI policy-gate testing.
const jsonSchema = require('json-schema');

function greet(name = 'World') {
  return _.trim(`Hello, ${name}!`);
}

function main() {
  const name = process.argv[2] || 'World';
  console.log(greet(name));
  // Keep the vulnerable module referenced so scanners catalog it.
  if (typeof jsonSchema.validate === 'function') {
    jsonSchema.validate({ type: 'string' }, 'ok');
  }
}

if (require.main === module) {
  main();
}

module.exports = { greet };
