import type { InterfaceLanguageCode } from "@/lib/i18n/interfaceLanguage";

export type InterfaceMessagePlaceholderType = "string" | "number" | "boolean" | "date";

export type InterfaceMessageMeta<Id extends string = string> = {
  id: Id;
  defaultMessage: string;
  description: string;
  context: string;
  placeholders?: Record<string, InterfaceMessagePlaceholderType>;
  glossaryTerms?: string[];
  screenshotSurface?: "account-session" | "settings" | "workstation";
  maxLengthHint?: number;
};

export type InterfaceTargetCatalog<Id extends string = string> = Partial<Record<Id, string>>;

export type InterfaceCatalogReadiness = {
  language: InterfaceLanguageCode;
  reviewed: number;
  total: number;
  complete: boolean;
};
