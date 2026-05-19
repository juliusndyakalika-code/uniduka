import { Request, Response } from 'express';
import { getAllProfiles, loadBusinessProfile } from './business.profiles';
import * as R from '../../utils/response';

export function listProfiles(_req: Request, res: Response) {
  const profiles = getAllProfiles().map(p => ({
    type: p.type, label: p.label, group: p.group, description: p.description,
    inventoryModel: p.inventoryModel, pricingMode: p.pricingMode, taxMode: p.taxMode,
    moduleCount: p.modules.length, unitCount: p.units.length,
  }));
  return R.ok(res, profiles);
}

export function getProfile(req: Request, res: Response) {
  const profile = loadBusinessProfile(req.params.type.toUpperCase());
  if (!profile) return R.notFound(res, 'Business type not found');
  return R.ok(res, profile);
}
