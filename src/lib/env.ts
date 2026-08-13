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

function readBoolean(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  return value === 'true' || value === '1' || value === 'yes';
}

// Mock controls are dev-only tooling: deriving mode from either flag keeps the
// WHATSAPP_MOCK_FAIL docs honest, and the NODE_ENV guard guarantees production
// sends always reach the real provider.
const devOnly = process.env.NODE_ENV !== 'production';
const whatsappMockFail = devOnly && readBoolean('WHATSAPP_MOCK_FAIL');

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
  whatsappMockMode: devOnly && (readBoolean('WHATSAPP_MOCK_MODE') || whatsappMockFail),
  whatsappMockFail,
};
