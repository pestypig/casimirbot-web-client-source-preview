import { useQuery } from "@tanstack/react-query";
import { EssenceThemeDeck, type TEssenceThemeDeck } from "@shared/essence-themes";

type UseEssenceThemesOptions = {
  enabled?: boolean;
};

async function fetchThemeDeck(): Promise<TEssenceThemeDeck> {
  const response = await fetch("/api/essence/themes");
  if (!response.ok) {
    throw new Error(`theme_deck_fetch_failed:${response.status}`);
  }
  const payload = await response.json();
  return EssenceThemeDeck.parse(payload);
}

export function useEssenceThemes(options?: UseEssenceThemesOptions) {
  return useQuery<TEssenceThemeDeck>({
    queryKey: ["essence-theme-deck"],
    queryFn: fetchThemeDeck,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}
