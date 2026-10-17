import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IdeologyDoc, IdeologyNode } from "@/lib/ideology-types";
import { apiRequest } from "@/lib/queryClient";

export function useIdeology() {
  const query = useQuery({
    queryKey: ["/api/ethos/ideology"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ethos/ideology");
      return (await res.json()) as IdeologyDoc;
    },
    staleTime: Infinity
  });

  const byId = useMemo(() => {
    const map = new Map<string, IdeologyNode>();
    if (query.data) {
      for (const node of query.data.nodes) {
        map.set(node.id, node);
        if (node.slug) {
          map.set(node.slug, node);
        }
      }
    }
    return map;
  }, [query.data]);

  const childrenOf = (id: string) => {
    const node = byId.get(id);
    if (!node) return [];
    return (node.children ?? [])
      .map((childId) => byId.get(childId))
      .filter((n): n is IdeologyNode => Boolean(n));
  };

  const resolve = (idOrSlug: string) => byId.get(idOrSlug) ?? null;

  return {
    ...query,
    byId,
    childrenOf,
    resolve
  };
}
