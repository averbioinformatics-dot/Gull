// Make a sign-in entry for GULL_USERS.
//   node scripts/hash-password.mjs <username> "<Full Name>" [password]
// Leave the password out and a strong one is generated. Prints the password once, and the JSON entry to paste into GULL_USERS.
import crypto from 'node:crypto';
import { hashPassword } from '../lib/auth.js';

const [username, name, given] = process.argv.slice(2);
if (!username || !name) {
  console.error('Usage: node scripts/hash-password.mjs <username> "<Full Name>" [password]');
  process.exit(1);
}
// four groups of five from an alphabet without look-alikes (no 0/O, 1/l/I)
const ABC = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generated = () => Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ABC[crypto.randomInt(ABC.length)]).join('')).join('-');
const password = given || generated();
console.log(`username: ${username.trim().toLowerCase()}`);
console.log(`password: ${password}`);
console.log(JSON.stringify({ u: username.trim().toLowerCase(), name, h: hashPassword(password) }));
