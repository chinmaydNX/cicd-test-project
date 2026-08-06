const _ = require('lodash');

function greet(name = 'World') {
  return _.trim(`Hello, ${name}!`);
}

function main() {
  const name = process.argv[2] || 'World';
  console.log(greet(name));
}

if (require.main === module) {
  main();
}

module.exports = { greet };
