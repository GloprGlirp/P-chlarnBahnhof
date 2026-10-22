// Registrierung, Login, Tokens
import crypto from 'node:crypto';
import { getUser, saveUser } from './db.js';
import { newProfileData, levelInfo, validateClass, CLASS_COUNT } from '../shared/progression.js';

const NAME_RE = /^[A-Za-z0-9_\-äöüÄÖÜß]{3,16}$/;
const TOKEN_DAYS = 60;

function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

function newToken(user) {
  const t = user.key + '.' + crypto.randomBytes(24).toString('hex');
  user.tokens = (user.tokens || []).filter(x => x.exp > Date.now()).slice(-4);
  user.tokens.push({ t, exp: Date.now() + TOKEN_DAYS * 864e5 });
  return t;
}

export async function register(username, password) {
  username = String(username || '').trim();
  if (!NAME_RE.test(username)) throw new Error('Name: 3-16 Zeichen (Buchstaben, Zahlen, _ -)');
  if (String(password || '').length < 4) throw new Error('Passwort: mindestens 4 Zeichen');
  const key = username.toLowerCase();
  if (await getUser(key)) throw new Error('Name ist schon vergeben');
  const salt = crypto.randomBytes(16).toString('hex');
  const user = { key, username, salt, pass: hashPw(String(password), salt), created: Date.now(), data: newProfileData(), tokens: [] };
  const token = newToken(user);
  await saveUser(user);
  return { token, user };
}

export async function login(username, password) {
  const key = String(username || '').trim().toLowerCase();
  const user = await getUser(key);
  if (!user) throw new Error('Unbekannter Name oder falsches Passwort');
  const h = hashPw(String(password || ''), user.salt);
  if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(user.pass, 'hex'))) throw new Error('Unbekannter Name oder falsches Passwort');
  const token = newToken(user);
  await saveUser(user);
  return { token, user };
}

export async function userFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const key = token.split('.')[0];
  const user = await getUser(key);
  if (!user) return null;
  const rec = (user.tokens || []).find(x => x.t === token);
  if (!rec || rec.exp < Date.now()) return null;
  return user;
}

export async function logout(token) {
  const user = await userFromToken(token);
  if (!user) return;
  user.tokens = user.tokens.filter(x => x.t !== token);
  await saveUser(user);
}

export function publicProfile(user) {
  const d = user.data;
  return {
    username: user.username,
    xp: d.xp, level: levelInfo(d.xp),
    weaponXp: d.weaponXp, classes: d.classes, stats: d.stats,
    guest: !!user.guest,
  };
}

export async function saveClasses(user, classes) {
  if (!Array.isArray(classes)) throw new Error('Ungültig');
  const out = [];
  for (let i = 0; i < CLASS_COUNT; i++) out.push(validateClass(classes[i] || user.data.classes[i], user.data));
  user.data.classes = out;
  if (!user.guest) await saveUser(user);
  return out;
}

export function makeGuest(name) {
  const clean = String(name || '').replace(/[^A-Za-z0-9_\-äöüÄÖÜß]/g, '').slice(0, 12) || 'Gast';
  return {
    key: 'guest:' + crypto.randomBytes(6).toString('hex'),
    username: clean + '#' + Math.floor(100 + Math.random() * 900),
    guest: true, data: newProfileData(), tokens: [],
  };
}
