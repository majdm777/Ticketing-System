function readString(name: string, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

function readPositiveNumber(name: string, fallback: number) {
  const value = process.env[name];
  const parsed = value && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  adminPassword: readString('ADMIN_PASSWORD'),
  adminSessionSecret: readString('ADMIN_SESSION_SECRET'),
  ticketSecret: readString('TICKET_SECRET'),
  pendingOnlineExpiryHours: readPositiveNumber('PENDING_ONLINE_EXPIRY_HOURS', 3),
  pendingDoorExpiryHours: readPositiveNumber('PENDING_DOOR_EXPIRY_HOURS', 24),
};
