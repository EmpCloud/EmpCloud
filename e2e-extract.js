// Usage: node e2e-extract.js <file> <js-expression>
// Example: node e2e-extract.js body.txt "d.data.tokens.access_token"
const fs = require('fs');
try {
  const file = process.argv[2];
  const expr = process.argv[3];
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = eval(expr);
  if (r != null) process.stdout.write(String(r));
} catch (e) {
  // silently fail
}
