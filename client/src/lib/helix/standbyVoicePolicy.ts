import {
  DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY,
  type HelixStandbyVoicePolicy,
} from "@shared/helix-standby-voice-policy";

export function canDeliverStandbyVoice(args: {
  policy?: HelixStandbyVoicePolicy | null;
  priority: "info" | "warn" | "critical" | "action";
  requiresConfirmation?: boolean;
  directAddressAuthorized?: boolean;
}): boolean {
  const policy = args.policy ?? DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY;
  if (!policy.voice_output_enabled) return false;
  if (policy.standby_voice_mode === "off" || policy.standby_voice_mode === "text_only") return false;
  if (policy.standby_voice_mode === "direct_address_only") return args.directAddressAuthorized === true;
  if (policy.standby_voice_mode === "voice_on_confirm") return args.requiresConfirmation === false;
  if (policy.standby_voice_mode === "critical_voice") {
    return args.priority === "critical" || args.priority === "action";
  }
  return false;
}

export function describeStandbyVoicePolicy(policy?: HelixStandbyVoicePolicy | null): string {
  const next = policy ?? DEFAULT_MINECRAFT_STANDBY_VOICE_POLICY;
  if (!next.voice_output_enabled) return "Voice output off";
  if (next.standby_voice_mode === "voice_on_confirm") return "Voice on confirm";
  if (next.standby_voice_mode === "critical_voice") return "Critical voice";
  return next.standby_voice_mode.replace(/_/g, " ");
}
