// Provider-adapter contract for the customer hosting manager (WHMCS client area -> /api/hosting/* -> panel API).
// One adapter per panel type (lib/hosting/providers/*). Each adapter acts *as the hosting account's own user* and
// declares what it supports in `caps`; the client area panel hides tabs and buttons that are not listed.
import type { DnsInput } from './validate';

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

export type Section = 'dns' | 'email' | 'files' | 'databases' | 'ssl' | 'backups';
/** Sub-features per section, e.g. { files: ['list','read','write','upload','download','mkdir','rename','delete'] }. */
export type Caps = Partial<Record<Section, string[]>>;

export interface DnsRecord extends DnsInput { id: string; readonly?: boolean }
export interface Mailbox { user: string; email: string; quotaMb: number; usedMb: number; suspended?: boolean }
export interface Forwarder { user: string; email: string; to: string[] }
export interface FileEntry { name: string; path: string; type: 'file' | 'dir' | 'link'; size: number; modified: string; perms?: string }
export interface Database { name: string; users: string[]; sizeMb?: number }
export interface SslStatus { domain: string; https: boolean; issuer?: string; subject?: string; validTo?: string; daysLeft?: number; names?: string[]; error?: string }
export interface Backup { name: string; size?: number; created?: string }

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
  backups?: { list(): Promise<Backup[]>; create(): Promise<string>; restore?(name: string): Promise<string> };
  // Reserved for a future VPS adapter (e.g. the SBVPS reseller module): power(), reboot(), reinstall(), console().
}

export class PanelError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
