function readString(name: string, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

function readPositiveNumber(name: string, fallback: number) {
  const value = process.env[name];
  const parsed = value && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStringOrUndefined(name: string): string | undefined {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  adminPassword: readString('ADMIN_PASSWORD'),
  adminSessionSecret: readString('ADMIN_SESSION_SECRET'),
  ticketSecret: readString('TICKET_SECRET'),
  cronSecret: readString('CRON_SECRET'),
  pendingOnlineExpiryHours: readPositiveNumber('PENDING_ONLINE_EXPIRY_HOURS', 3),
  pendingDoorExpiryHours: readPositiveNumber('PENDING_DOOR_EXPIRY_HOURS', 24),
  sendTimeoutMs: readPositiveNumber('SEND_TIMEOUT_MS', 15000),
  whatsappAccessToken: readStringOrUndefined('WHATSAPP_ACCESS_TOKEN'),
  whatsappPhoneNumberId: readStringOrUndefined('WHATSAPP_PHONE_NUMBER_ID'),
  whatsappApiVersion: readStringOrUndefined('WHATSAPP_API_VERSION') ?? 'v21.0',
  whatsappTemplateName: readStringOrUndefined('WHATSAPP_TEMPLATE_NAME'),
  whatsappDefaultCountryCode: readStringOrUndefined('WHATSAPP_DEFAULT_COUNTRY_CODE'),
};
