import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import type { NavigationPose } from "@shared/schema";

export const NAV_POSE_TOPIC = "nav:pose";

export const publishNavPose = (pose: NavigationPose): void => {
  publish(NAV_POSE_TOPIC, pose);
};

/** Subscribe to nav pose; returns a disposer. */
export const subscribeNavPose = (cb: (pose: NavigationPose) => void): (() => void) => {
  const id = subscribe(NAV_POSE_TOPIC, (payload) => cb(payload as NavigationPose));
  return () => unsubscribe(id);
};
