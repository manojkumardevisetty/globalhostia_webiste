'use server';
import { requireSession, audit } from '@/lib/session';
import { done, fail, str } from '@/lib/admin';
import { moduleAction, moduleCustom, MODULE_ACTIONS } from '@/lib/whmcs';

const BACK = '/admin/whmcs/vps';

/** Runs a provisioning action on one WHMCS service. Terminate is deliberately not offered here (irreversible: do it in WHMCS). */
export async function runModuleAction(fd: FormData) {
  const s = await requireSession('integration');
  const serviceid = Number(str(fd, 'serviceid'));
  const action = str(fd, 'action');
  const custom = str(fd, 'func');
  if (!serviceid) fail(BACK, 'Missing service');
  if (str(fd, 'confirm') !== String(serviceid)) fail(BACK, `Type the service ID (${serviceid}) to confirm`);
  try {
    if (action === 'custom') {
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(custom)) fail(BACK, 'Invalid custom function name');
      await moduleCustom(serviceid, custom);
    } else if (action in MODULE_ACTIONS) {
      await moduleAction(action as keyof typeof MODULE_ACTIONS, serviceid, action === 'suspend' ? { suspendreason: str(fd, 'reason') || 'Suspended from admin panel' } : {});
    } else fail(BACK, 'Unknown action');
  } catch (e: any) {
    await audit(s, `vps_${action}_failed`, 'whmcs_service', String(serviceid), { func: custom, error: e?.message });
    fail(BACK, `WHMCS refused ${action}${custom ? ` (${custom})` : ''} on service #${serviceid}: ${e?.message}`);
  }
  await audit(s, `vps_${action}`, 'whmcs_service', String(serviceid), custom ? { func: custom } : undefined);
  done(BACK, `${action === 'custom' ? custom : action} sent to WHMCS for service #${serviceid}`);
}
