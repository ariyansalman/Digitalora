import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cryptoPay = fs.readFileSync(path.join(root, 'src/services/cryptoPayDeposit.ts'), 'utf8');
const chain = fs.readFileSync(path.join(root, 'src/services/chainVerify.ts'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/handlers/admin/index.ts'), 'utf8');

assert.match(cryptoPay, /approveDepositAtomic/);
assert.doesNotMatch(cryptoPay, /creditCryptoPayDeposit/);
assert.match(chain, /candidate\.to\.toLowerCase\(\) === args\.expectedAddress\.toLowerCase\(\)/);
assert.doesNotMatch(chain, /Tolerance: ±2%/);
assert.match(chain, /minimumReceived = Math\.max\(0, args\.expectedLtcAmount - 0\.00000001\)/);
assert.match(admin, /approval\.is_direct/);
assert.match(admin, /fulfilment still needs recovery/);

console.log('payment gateway hardening tests: 6/6 PASS');
