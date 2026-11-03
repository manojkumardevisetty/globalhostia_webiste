// Provider-adapter contract for the customer hosting manager (WHMCS client area -> /api/hosting/* -> panel API).
// One adapter per panel type (lib/hosting/providers/*). Each adapter acts *as the hosting account's own user* and
// declares what it supports in `caps`; the client area panel hides tabs and buttons that are not listed.
import type { DnsInput, SpamInput } from './validate';

export type PanelType = 'directadmin' | 'cpanel' | 'plesk';
export const PANEL_TYPES: PanelType[] = ['directadmin', 'cpanel', 'plesk'];
export const PANEL_LABEL: Record<PanelType, string> = { directadmin: 'DirectAdmin', cpanel: 'cPanel / WHM', plesk: 'Plesk' };

/** A server the admin configured in /admin/hosting. `secret` is decrypted server-side only, never serialised to a client. */
export interface ServerConfig {
  id: string; name: string; panel: PanelType; url: string; apiUser: string; secret: string; enabled: boolean;
  /** WHMCS server IDs (tblservers.id / GetClientsProducts serverid) and host names / IPs this entry serves. */
  whmcsServerIds: number[]; match: string[];
}

export interface Account { username: string; domain: string; server: ServerConfig }

export type Section =
  | 'overview' | 'dns' | 'subdomains' | 'aliases' | 'redirects' | 'ssl' | 'php'
  | 'email' | 'autoresponders' | 'spam' | 'files' | 'ftp' | 'protect' | 'databases' | 'cron' | 'backups' | 'wordpress';
/** Sub-features per section, e.g. { files: ['list','read','write','upload','download','mkdir','rename','delete'] }. */
export type Caps = Partial<Record<Section, string[]>>;

export interface DnsRecord extends DnsInput { id: string; readonly?: boolean }
export interface Mailbox { user: string; email: string; quotaMb: number; usedMb: number; suspended?: boolean }
export interface Forwarder { user: string; email: string; to: string[] }
export interface FileEntry { name: string; path: string; type: 'file' | 'dir' | 'link'; size: number; modified: string; perms?: string }
export interface Database { name: string; users: string[]; sizeMb?: number }
export interface SslStatus { domain: string; https: boolean; issuer?: string; subject?: string; validTo?: string; daysLeft?: number; names?: string[]; error?: string }
export interface Backup { name: string; size?: number; created?: string }
export interface UsageItem { key: string; label: string; used: number; limit: number | null; unit?: 'MB' | '' }
export interface Usage { items: UsageItem[]; plan?: string; ip?: string; suspended?: boolean }
export interface Alias { name: string; type: 'alias' | 'pointer' }
export interface Redirect { path: string; to: string; type: string }
export interface PhpState { current: string; options: { id: string; label: string }[] }
export interface Autoresponder { user: string; email: string; cc: string }
export interface Vacation { user: string; email: string; start?: string; end?: string }
export interface SpamState extends SpamInput { available: boolean }
export interface FtpAccount { user: string; login: string; path: string }
export interface CronJob { id: string; minute: string; hour: string; dayofmonth: string; month: string; dayofweek: string; command: string }
export interface Protected { path: string; realm: string; users: string[] }
export interface WpSite { url: string; path: string; version?: string }

export interface HostingProvider {
  readonly panel: PanelType;
  readonly caps: Caps;
  /** Prefix the panel puts in front of database / database-user names (e.g. "bob_"). */
  dbPrefix(): Promise<string>;
  /** Domains owned by this account, as reported by the panel acting as the user. */
  domains(): Promise<string[]>;
  dns?: {
    list(domain: string): Promise<DnsRecord[]>;
    add(domain: string, r: DnsInput): Promise<void>;
    edit(domain: string, old: DnsRecord, r: DnsInput): Promise<void>;
    remove(domain: string, old: DnsRecord): Promise<void>;
  };
  email?: {
    list(domain: string): Promise<Mailbox[]>;
    create(domain: string, user: string, pass: string, quotaMb: number): Promise<void>;
    remove(domain: string, user: string): Promise<void>;
    password(domain: string, user: string, pass: string): Promise<void>;
    quota(domain: string, user: string, quotaMb: number): Promise<void>;
    forwarders(domain: string): Promise<Forwarder[]>;
    addForwarder(domain: string, user: string, to: string): Promise<void>;
    removeForwarder(domain: string, user: string, to?: string): Promise<void>;
  };
  files?: {
    list(dir: string): Promise<FileEntry[]>;
    read(path: string, maxBytes: number): Promise<Uint8Array>;
    write(path: string, text: string): Promise<void>;
    upload?(dir: string, name: string, data: Uint8Array): Promise<void>;
    mkdir(dir: string, name: string): Promise<void>;
    rename(dir: string, from: string, to: string): Promise<void>;
    remove(dir: string, names: string[]): Promise<void>;
  };
  databases?: {
    list(): Promise<Database[]>;
    create(name: string, user: string, pass: string): Promise<void>;
    remove(name: string): Promise<void>;
    addUser(db: string, user: string, pass: string): Promise<void>;
    removeUser(db: string, user: string): Promise<void>;
    password(db: string, user: string, pass: string): Promise<void>;
  };
  ssl?: { issue(domain: string, withWww: boolean): Promise<string> };
  usage?(): Promise<Usage>;
  /** Optional per-account probe: caps to drop or add for features the server may not have (e.g. a WordPress manager). */
  detect?(): Promise<Caps>;
  subdomains?: { list(domain: string): Promise<string[]>; add(domain: string, label: string): Promise<void>; remove(domain: string, label: string, contents: boolean): Promise<void> };
  aliases?: { list(domain: string): Promise<Alias[]>; add(domain: string, from: string, alias: boolean): Promise<void>; remove(domain: string, name: string): Promise<void> };
  redirects?: { list(domain: string): Promise<Redirect[]>; add(domain: string, path: string, to: string, type: string): Promise<void>; remove(domain: string, r: Redirect): Promise<void> };
  php?: { get(domain: string): Promise<PhpState>; set(domain: string, id: string): Promise<void> };
  autoresponders?: {
    list(domain: string): Promise<Autoresponder[]>;
    create(domain: string, user: string, text: string, cc: string): Promise<void>;
    remove(domain: string, user: string): Promise<void>;
    vacations?(domain: string): Promise<Vacation[]>;
    setVacation?(domain: string, user: string, text: string, start: { y: number; m: number; d: number }, end: { y: number; m: number; d: number }): Promise<void>;
    removeVacation?(domain: string, user: string): Promise<void>;
  };
  spam?: { get(domain: string): Promise<SpamState>; set(domain: string, s: SpamInput): Promise<void> };
  ftp?: { list(domain: string): Promise<FtpAccount[]>; create(domain: string, user: string, pass: string, dir: string): Promise<void>; password(domain: string, user: string, pass: string): Promise<void>; remove(domain: string, user: string): Promise<void> };
  cron?: { list(): Promise<CronJob[]>; add(j: Omit<CronJob, 'id'>): Promise<void>; remove(id: string): Promise<void> };
  protect?: { list(): Promise<Protected[]>; add(path: string, realm: string, user: string, pass: string): Promise<void>; remove(path: string): Promise<void> };
  wordpress?: { list(): Promise<WpSite[]> };
  backups?: { list(): Promise<Backup[]>; create(): Promise<string>; restore?(name: string): Promise<string> };
  // Reserved for a future VPS adapter (e.g. the SBVPS reseller module): power(), reboot(), reinstall(), console().
}

export class PanelError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
