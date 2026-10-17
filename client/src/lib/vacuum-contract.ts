import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import type { VacuumContract } from "@shared/schema";

const VACUUM_CONTRACT_TOPIC = "vacuum:contract";

const unique = <T>(items: T[]): T[] => {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
};

export const normalizeVacuumContract = (contract: VacuumContract): VacuumContract => {
  const updatedAt = Number.isFinite(contract.updatedAt) ? contract.updatedAt : Date.now();
  const status = contract.status ?? "green";
  const changed = Array.isArray(contract.changed) ? unique(contract.changed) : [];
  return {
    ...contract,
    status,
    changed,
    updatedAt,
  };
};

export const publishVacuumContract = (contract: VacuumContract) => {
  publish(VACUUM_CONTRACT_TOPIC, normalizeVacuumContract(contract));
};

export const subscribeVacuumContract = (handler: (contract: VacuumContract) => void) => {
  const id = subscribe(VACUUM_CONTRACT_TOPIC, (payload) => {
    handler(normalizeVacuumContract(payload as VacuumContract));
  });
  return () => {
    unsubscribe(id);
  };
};

