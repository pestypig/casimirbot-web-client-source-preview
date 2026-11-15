import {Quaternion,Vector3} from 'three';
import type {SolarObserverGeometry} from '../../../shared/solar-surface-registration';

const yAxis=new Vector3(0,1,0);
const zAxis=new Vector3(0,0,1);
const radians=Math.PI/180;

/** Carrington sphere into one solar-north-up observer frame. */
function observerBasis(observer:Pick<SolarObserverGeometry,
  'observerCarringtonLongitudeDeg'|'observerCarringtonLatitudeDeg'>):Quaternion{
  return new Quaternion().setFromAxisAngle(yAxis,-observer.observerCarringtonLongitudeDeg*radians)
    .multiply(new Quaternion().setFromAxisAngle(zAxis,observer.observerCarringtonLatitudeDeg*radians));
}

/** Maps a source observation's Earth-facing disk onto a fixed reference view. */
export function earthViewPose(reference:Pick<SolarObserverGeometry,
  'observerCarringtonLongitudeDeg'|'observerCarringtonLatitudeDeg'>,
current:Pick<SolarObserverGeometry,
  'observerCarringtonLongitudeDeg'|'observerCarringtonLatitudeDeg'>):Quaternion{
  return observerBasis(reference).multiply(observerBasis(current).invert());
}
