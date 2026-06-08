import { encrypt, decrypt } from '../lib/crypto';
import dotenv from 'dotenv';
import path from 'path';

// Carrega o .env caso não tenha a chave ainda
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const originalText = 'abc';
const encrypted = encrypt(originalText);
const decrypted = decrypt(encrypted);

console.log('Original:', originalText);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);

if (originalText !== decrypted) {
  console.error('Test Failed: Decrypted text does not match original!');
  process.exit(1);
}

// Test tampering
try {
  const tampered = encrypted.substring(0, encrypted.length - 1) + (encrypted.endsWith('A') ? 'B' : 'A');
  decrypt(tampered);
  console.error('Test Failed: Tampering should have thrown an error!');
  process.exit(1);
} catch (e: any) {
  console.log('Tamper test passed. Caught expected error:', e.message);
}

console.log('All crypto tests passed!');
