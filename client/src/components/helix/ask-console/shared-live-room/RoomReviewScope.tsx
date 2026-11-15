import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";
import { captureAccountOperationScope } from "@/lib/workstation/accountOperationScope";

export type RoomReviewOperation = <T>(operation: () => Promise<T>) => Promise<T>;

/** Retires local review state on room, role or account changes. Server and
 * native authorization remain required for every operation. */
export function RoomReviewScope({ scopeKey, children }: {
  scopeKey: string; children: (run: RoomReviewOperation) => ReactNode;
}) {
  const [revision, setRevision] = useState(() => readCachedAccountProfileIdentity().revision);
  useEffect(() => {
    const update = () => setRevision(readCachedAccountProfileIdentity().revision);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, update);
    update();
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, update);
  }, []);
  return <ReviewSession key={JSON.stringify([scopeKey, revision])}>{children}</ReviewSession>;
}

function ReviewSession({ children }: { children: (run: RoomReviewOperation) => ReactNode }) {
  const mounted = useRef(true);
  const account = useRef(captureAccountOperationScope());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (!mounted.current || !account.current()) throw new Error("room_review_scope_changed");
    const result = await operation();
    if (!mounted.current || !account.current()) throw new Error("room_review_scope_changed");
    return result;
  }, []);
  return <>{children(run)}</>;
}
