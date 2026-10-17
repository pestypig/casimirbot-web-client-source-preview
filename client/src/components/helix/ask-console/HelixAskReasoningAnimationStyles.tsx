export function HelixAskReasoningAnimationStyles() {
  return (
    <style>
      {`@keyframes helixReasoningFloatingText{0%{opacity:0;transform:translate3d(-50%,0,0) scale(.94)}14%{opacity:1}72%{opacity:.82}100%{opacity:0;transform:translate3d(calc(-50% + var(--helix-pop-drift,0px)),var(--helix-pop-y,-28px),0) scale(1.04)}}@keyframes helixReasoningBattleBeat{0%{opacity:0;transform:translate3d(-50%,0,0) scale(.92)}16%{opacity:1}72%{opacity:.86}100%{opacity:0;transform:translate3d(calc(-50% + var(--beat-drift,0px)),var(--beat-y,-28px),0) scale(1.04)}}@keyframes helixReasoningBattlePrimitive{0%{opacity:0;transform:translate3d(-50%,-50%,0) scale(.72)}15%{opacity:1;transform:translate3d(-50%,-50%,0) scale(var(--battle-primitive-scale,1.1))}72%{opacity:.84}100%{opacity:0;transform:translate3d(calc(-50% + var(--battle-primitive-drift,0px)),var(--battle-primitive-y,-12px),0) scale(.86)}}`}
    </style>
  );
}
