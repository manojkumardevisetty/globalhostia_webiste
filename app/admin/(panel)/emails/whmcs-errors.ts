// Turns WHMCS API errors into plain instructions for the admin (no secrets in the output).
export const ROLE_HINT =
  'In WHMCS: Configuration (wrench) → System Settings → Manage API Credentials → API Roles → edit the role used by this site → under "System" tick GetConfigurationValue, SetConfigurationValue and GetEmailTemplates → Save.';

export function isPermissionError(msg: string) {
  return /permission|not allowed|access denied|unauthori[sz]ed|authentication failed|invalid ip/i.test(msg);
}

export function explainWhmcsError(e: unknown): string {
  const msg = (e as any)?.message || String(e);
  const action = (e as any)?.action ? `${(e as any).action}: ` : '';
  if (isPermissionError(msg)) return `${action}${msg}. The API credential is not allowed to do this. ${ROLE_HINT}`;
  if (/invalid name for parameter setting/i.test(msg)) return `${action}${msg}. This WHMCS version does not accept that setting name through the API - use the SQL below instead.`;
  if (/local api|not supported|unsupported/i.test(msg)) return `${action}${msg}. This action only works through WHMCS's local API on your server - use the SQL below instead.`;
  return `${action}${msg}`;
}
