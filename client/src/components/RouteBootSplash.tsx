import React from "react";
import { HelixLoadingMark } from "@/components/common/HelixLoadingMark";

type RouteBootSplashProps = {
  message?: string;
  detail?: string;
};

export default function RouteBootSplash({
  message = "Starting up...",
  detail = "Loading Helix experience",
}: RouteBootSplashProps) {
  return <HelixLoadingMark title={message} detail={detail} className="min-h-screen" />;
}
