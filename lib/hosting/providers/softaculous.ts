// Softaculous end-user API through the DirectAdmin plugin, acting as the hosting account's own user:
//   GET|POST https://<panel>:2222/CMD_PLUGINS/softaculous/index.raw?api=json&act=<action>&…
// with the same DirectAdmin login-as Basic auth the adapter uses ("<owner>|<user>:<login key>"), so the Login Key must
// allow CMD_PLUGINS (docs/whmcs/HOSTING-SETUP.md). Actions (softaculous.com/docs/api/api): installations, software
// (install, soft=26 WordPress), sign_on, staging, pushtolive, remove, backup, upgrade, eu_tasklist (background tasks).
// Answers: `done` on success (a 32-character task key for background jobs), `error` (field -> message) on failure.
// No 'server-only' import so tests/wordpress.test.mts can run it against tests/mock-da.mjs.
import { PanelError, type WpInstallInput, type WpJob, type WpSite, type WpTask } from '../types';
import { parseInstallations, parseTask, softError, taskKeyOf, wpAutoId, wpDbName, wpTablePrefix, WP_SID } from '../wordpress';
import { call } from './http';

export const SOFTACULOUS_PATH = '/CMD_PLUGINS/softaculous/index.raw';

type Opts = { form?: Record<string, string>; timeout?: number; secret?: string };

export function softaculous(base: string, authorization: string) {
  const url = (act: string, q: Record<string, string> = {}) => `${base.replace(/\/+$/, '')}${SOFTACULOUS_PATH}?${new URLSearchParams({ api: 'json', act, ...q })}`;

  async function req(act: string, q: Record<string, string> = {}, o: Opts = {}): Promise<any> {
    const res = await call(url(act, q), {
      method: o.form ? 'POST' : 'GET', body: o.form ? new URLSearchParams(o.form) : undefined, timeout: o.timeout,
      headers: { authorization, accept: 'application/json, */*', ...(o.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    });
    if (res.status === 404) throw new PanelError('WordPress tools (Softaculous) are not installed on this server.', 501);
    if (res.status === 401 || res.status === 403) throw new PanelError('The hosting panel refused the WordPress installer (the login key must allow CMD_PLUGINS).', 502);
    if (res.status >= 300 && res.status < 400) throw new PanelError('The hosting panel redirected the WordPress installer call (login key rejected or CMD_PLUGINS not allowed).', 502);
    if (res.status >= 500) throw new PanelError(`The WordPress installer failed (HTTP ${res.status}).`, 502);
    const text = (await res.text()).replace(/^﻿/, '').trim();
    let j: any;
    try { j = JSON.parse(text); } catch {
      if (/<html|<!doctype|<form/i.test(text.slice(0, 600))) throw new PanelError('The WordPress installer returned a web page instead of data (login key without CMD_PLUGINS, or Softaculous disabled for this account).', 502);
      throw new PanelError('Unreadable answer from the WordPress installer.', 502);
    }
    if (j && typeof j === 'object' && j.error && (typeof j.error === 'string' ? j.error.trim() : Object.keys(j.error).length)) throw new PanelError(softError(j.error, o.secret), 400);
    return j ?? {};
  }

  /** `done` -> job: background task key, or a finished action with the site URL. */
  const job = (j: any, ok: string, bg: string): WpJob => {
    const task = taskKeyOf(j?.done);
    const u = j?.__settings?.softurl || j?.liveins?.softurl;
    if (!task && !j?.done && !u && !j?.setupcontinue) throw new PanelError(softError(j?.error) || 'The WordPress installer did not confirm the request. Refresh the list to check.', 400);
    return { message: task ? bg : ok, task: task || undefined, url: typeof u === 'string' && /^https?:\/\//.test(u) ? u : undefined,
      continueUrl: typeof j?.setupcontinue === 'string' && /^https?:\/\//.test(j.setupcontinue) ? j.setupcontinue : undefined };
  };
  const proto = (https: boolean) => (https ? '3' : '1'); // softproto: 1 http://, 2 http://www., 3 https://, 4 https://www.

  return {
    async installations(timeout?: number): Promise<WpSite[]> {
      return parseInstallations(await req('installations', { showupdates: 'true' }, { timeout }));
    },
    async install(i: WpInstallInput): Promise<WpJob> {
      const form: Record<string, string> = {
        softsubmit: '1', softproto: proto(i.https), softdomain: i.domain, softdirectory: i.directory,
        softdb: wpDbName(), dbprefix: wpTablePrefix(), site_name: i.title, site_desc: i.title,
        admin_username: i.adminUser, admin_pass: i.password, admin_email: i.adminEmail, language: i.language,
        eu_auto_upgrade: i.autoUpdate.core ? '2' : '0', auto_upgrade_plugins: i.autoUpdate.plugins ? '1' : '0', auto_upgrade_themes: i.autoUpdate.themes ? '1' : '0',
      };
      if (i.emailTo) form.emailto = i.emailTo; // "Email installation details to"
      // installs take 10-40 s; stop waiting before the route's 60 s limit (the caller treats a timeout as "still running")
      const j = await req('software', { soft: WP_SID }, { form, timeout: 50_000, secret: i.password });
      return job(j, 'WordPress is installed.', 'WordPress is being installed.');
    },
    async signOn(insid: string): Promise<string> {
      const j = await req('sign_on', { insid, autoid: wpAutoId() });
      const u = String(j?.sign_on_url || '');
      if (!/^https?:\/\//.test(u)) throw new PanelError('The one-click login link could not be created. Log in at /wp-admin instead.', 400);
      return u;
    },
    async staging(insid: string, domain: string, directory: string, https: boolean): Promise<WpJob> {
      const j = await req('staging', { insid }, { form: { softsubmit: '1', softproto: proto(https), softdomain: domain, softdirectory: directory, softdb: wpDbName() } });
      return job(j, 'Staging copy created.', 'Creating the staging copy.');
    },
    async pushLive(insid: string): Promise<WpJob> {
      const j = await req('pushtolive', { insid }, { form: { softsubmit: '1' }, timeout: 40_000 });
      return job(j, 'Staging pushed to the live site.', 'Pushing staging to the live site.');
    },
    async remove(insid: string): Promise<WpJob> {
      const j = await req('remove', { insid }, { form: { removeins: '1', remove_dir: '1', remove_datadir: '1', remove_db: '1', remove_dbuser: '1' }, timeout: 40_000 });
      return job(j, 'Deleted.', 'Deleting.');
    },
    async backup(insid: string): Promise<WpJob> {
      const j = await req('backup', { insid }, { form: { backupins: '1', backup_dir: '1', backup_datadir: '1', backup_db: '1' }, timeout: 40_000 });
      return job(j, 'Backup finished. It is kept in your Softaculous backups.', 'Backing up the site.');
    },
    async upgrade(insid: string): Promise<WpJob> {
      const j = await req('upgrade', { insid }, { form: { softsubmit: '1' }, timeout: 50_000 });
      return job(j, 'WordPress is updated.', 'Updating WordPress.');
    },
    async task(key: string): Promise<WpTask> {
      return parseTask(await req('eu_tasklist', { ssk: key }, { timeout: 12_000 }));
    },
  };
}
export type Softaculous = ReturnType<typeof softaculous>;
