import { useEffect, useState } from "react";
import {
  MOBILE_BREAKPOINT_PX,
  TABLET_COARSE_BREAKPOINT_PX,
  resolveMobileDeviceSignals,
} from "@shared/mobile-device-detection";

const MOBILE_WIDTH_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
const TABLET_COARSE_WIDTH_QUERY = `(max-width: ${TABLET_COARSE_BREAKPOINT_PX}px)`;
const PRIMARY_COARSE_POINTER_QUERY = "(hover: none) and (pointer: coarse)";
const ANY_COARSE_POINTER_QUERY = "(any-pointer: coarse)";
const computeIsMobile = (
  widthQuery?: MediaQueryList,
  tabletWidthQuery?: MediaQueryList,
  primaryPointerQuery?: MediaQueryList,
  anyPointerQuery?: MediaQueryList,
) => {
  if (typeof window === "undefined") return false;

  const widthMatch =
    widthQuery?.matches ?? window.matchMedia(MOBILE_WIDTH_QUERY).matches;
  const tabletWidthMatch =
    tabletWidthQuery?.matches ??
    window.matchMedia(TABLET_COARSE_WIDTH_QUERY).matches;
  const primaryPointerMatch =
    primaryPointerQuery?.matches ??
    window.matchMedia(PRIMARY_COARSE_POINTER_QUERY).matches;
  const anyPointerMatch =
    anyPointerQuery?.matches ??
    window.matchMedia(ANY_COARSE_POINTER_QUERY).matches;

  const browserNavigator = typeof navigator !== "undefined" ? navigator : null;
  const userAgentDataMobile = (
    browserNavigator as Navigator & { userAgentData?: { mobile?: boolean } }
  )?.userAgentData?.mobile;

  return resolveMobileDeviceSignals({
    userAgent: browserNavigator?.userAgent,
    userAgentDataMobile,
    maxTouchPoints: browserNavigator?.maxTouchPoints,
    viewportWidth: widthMatch
      ? MOBILE_BREAKPOINT_PX
      : tabletWidthMatch
        ? TABLET_COARSE_BREAKPOINT_PX
        : window.innerWidth,
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    primaryCoarsePointer: primaryPointerMatch,
    anyCoarsePointer: anyPointerMatch,
  });
};

const addMediaListener = (query: MediaQueryList, listener: () => void) => {
  if (query.addEventListener) {
    query.addEventListener("change", listener);
  } else if (query.addListener) {
    query.addListener(listener);
  }
};

const removeMediaListener = (query: MediaQueryList, listener: () => void) => {
  if (query.removeEventListener) {
    query.removeEventListener("change", listener);
  } else if (query.removeListener) {
    query.removeListener(listener);
  }
};

export function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const widthQuery = window.matchMedia(MOBILE_WIDTH_QUERY);
    const tabletWidthQuery = window.matchMedia(TABLET_COARSE_WIDTH_QUERY);
    const primaryPointerQuery = window.matchMedia(PRIMARY_COARSE_POINTER_QUERY);
    const anyPointerQuery = window.matchMedia(ANY_COARSE_POINTER_QUERY);
    return computeIsMobile(
      widthQuery,
      tabletWidthQuery,
      primaryPointerQuery,
      anyPointerQuery,
    );
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const widthQuery = window.matchMedia(MOBILE_WIDTH_QUERY);
    const tabletWidthQuery = window.matchMedia(TABLET_COARSE_WIDTH_QUERY);
    const primaryPointerQuery = window.matchMedia(PRIMARY_COARSE_POINTER_QUERY);
    const anyPointerQuery = window.matchMedia(ANY_COARSE_POINTER_QUERY);
    const update = () =>
      setIsMobile(
        computeIsMobile(
          widthQuery,
          tabletWidthQuery,
          primaryPointerQuery,
          anyPointerQuery,
        ),
      );

    update();
    addMediaListener(widthQuery, update);
    addMediaListener(tabletWidthQuery, update);
    addMediaListener(primaryPointerQuery, update);
    addMediaListener(anyPointerQuery, update);
    window.addEventListener("resize", update);

    return () => {
      removeMediaListener(widthQuery, update);
      removeMediaListener(tabletWidthQuery, update);
      removeMediaListener(primaryPointerQuery, update);
      removeMediaListener(anyPointerQuery, update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return { isMobile: !!isMobile, isReady: isMobile !== undefined };
}
