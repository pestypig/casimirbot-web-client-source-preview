import {
  curvatureProxyPrefactors,
  kappa_body,
  kappa_drive,
  kappa_drive_from_power,
} from "@shared/curvature-proxy";

export const curvaturePrefactors = {
  drive: curvatureProxyPrefactors.drive,
  body: curvatureProxyPrefactors.body,
};

export function kappaBody(rho: number) {
  return kappa_body(rho);
}

export function kappaDrive(powerPerArea: number, dEff = 1, gain = 1) {
  return kappa_drive(powerPerArea, dEff, gain);
}

export function kappaDriveFromPower(powerW: number, areaM2: number, dEff = 1, gain = 1) {
  return kappa_drive_from_power(powerW, areaM2, dEff, gain);
}

export function potatoEfficiency(kappaDriveValue: number, kappaBodyValue: number) {
  if (!Number.isFinite(kappaDriveValue) || !Number.isFinite(kappaBodyValue) || kappaBodyValue === 0) {
    return Number.NaN;
  }
  return kappaDriveValue / kappaBodyValue;
}
