import crypto from 'crypto';

import { env } from './env';

export const ADMIN_SESSION_COOKIE = 'admin_session';
const SESSION_HOURS = 12;

export type AdminSession = {
  adminName: string;
  expiresAt: number;
};

function sessionSecret() {
  if (!env.adminSessionSecret) {
    throw new Error('ADMIN_SESSION_SECRET is not configured');
  }

  return env.adminSessionSecret;
}

function sign(payload: string) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyPassword(candidate: string) {
  const expected = env.adminPassword;

  if (!expected) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  if (candidateBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function createSessionValue(adminName: string, now = Date.now()) {
  const expiresAt = now + SESSION_HOURS * 60 * 60 * 1000;
  const payload = `${adminName}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
}

export function verifySessionValue(value?: string): AdminSession | null {
  if (!value) {
    return null;
  }

  const parts = value.split('.');
  if (parts.length < 3) {
    return null;
  }

  const signature = parts.pop();
  const expiresAtRaw = parts.pop();
  const adminName = parts.join('.');

  if (!signature || !expiresAtRaw) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!adminName || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const payload = `${adminName}.${expiresAt}`;
  if (!safeEqual(signature, sign(payload))) {
    return null;
  }

  return { adminName, expiresAt };
}

export function readSessionFromRequestCookies(
  requestCookies: { get(name: string): { value: string } | undefined },
) {
  return verifySessionValue(requestCookies.get(ADMIN_SESSION_COOKIE)?.value);
}
