import { verifyMetaSignature } from './src/whatsapp/security/verifyMetaSignature';
import crypto from 'crypto';

process.env.META_APP_SECRET = 'test_secret';

const rawBody = Buffer.from('{"test":"payload"}');

// Test 1: No signature header
if (verifyMetaSignature(rawBody, undefined)) {
    console.error('Test 1 Failed: Expected false when no signature provided');
    process.exit(1);
}

// Test 2: Invalid signature
if (verifyMetaSignature(rawBody, 'sha256=invalid')) {
    console.error('Test 2 Failed: Expected false for invalid signature');
    process.exit(1);
}

// Test 3: Valid signature
const validSignature = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex');
if (!verifyMetaSignature(rawBody, validSignature)) {
    console.error('Test 3 Failed: Expected true for valid signature');
    process.exit(1);
}

// Test 4: Missing secret (should return true with warning)
process.env.META_APP_SECRET = '';
if (!verifyMetaSignature(rawBody, validSignature)) {
    console.error('Test 4 Failed: Expected true when secret is missing');
    process.exit(1);
}

console.log('All tests passed!');
