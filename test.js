const { toAurebesh, toEnglish } = require('./aurebesh');
const { generateAurebeshImage } = require('./imageGenerator');
const path = require('path');
const fs = require('fs');

console.log('✦ AUREBESH TRANSLATOR TESTS ✦\n');

// Test translations
const tests = [
  { input: 'Hello', expected: 'Herf-Esk-Leth-Leth-Osk' },
  { input: 'May the Force', expected: 'Mern-Aurek-Yirt / Thesh-Esk / Forn-Osk-Resh-Cresh-Esk' },
  { input: 'Jedi', expected: 'Jenth-Esk-Dorn-Isk' },
  { input: 'Sith', expected: 'Senth-Isk-Thesh' },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = toAurebesh(test.input);
  if (result === test.expected) {
    console.log(`✓ PASS: "${test.input}" -> "${result}"`);
    passed++;
  } else {
    console.log(`✗ FAIL: "${test.input}"`);
    console.log(`  Expected: "${test.expected}"`);
    console.log(`  Got:      "${result}"`);
    failed++;
  }
}

// Test decode
console.log('\n--- Decode Tests ---');
const decodeTests = [
  { input: 'Herf-Esk-Leth-Leth-Osk', expected: 'HELLO' },
  { input: 'Jenth-Esk-Dorn-Isk', expected: 'JEDI' },
];

for (const test of decodeTests) {
  const result = toEnglish(test.input);
  if (result === test.expected) {
    console.log(`✓ PASS: "${test.input}" -> "${result}"`);
    passed++;
  } else {
    console.log(`✗ FAIL: "${test.input}"`);
    console.log(`  Expected: "${test.expected}"`);
    console.log(`  Got:      "${result}"`);
    failed++;
  }
}

// Test image generation
console.log('\n--- Image Generation Test ---');
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}
const testImagePath = path.join(imagesDir, 'test_output.png');
try {
  generateAurebeshImage('JEDI', testImagePath);
  if (fs.existsSync(testImagePath)) {
    const stats = fs.statSync(testImagePath);
    console.log(`✓ PASS: Image generated (${stats.size} bytes)`);
    fs.unlinkSync(testImagePath);
    passed++;
  } else {
    console.log('✗ FAIL: Image file not created');
    failed++;
  }
} catch (err) {
  console.log(`✗ FAIL: Image generation error: ${err.message}`);
  failed++;
}

console.log(`\n✦ Results: ${passed} passed, ${failed} failed ✦\n`);
process.exit(failed > 0 ? 1 : 0);
