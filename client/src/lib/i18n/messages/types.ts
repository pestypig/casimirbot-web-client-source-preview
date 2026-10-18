export { INTERFACE_MESSAGE_IDS, interfaceSourceMessages, type InterfaceMessageId } from "./source";
export type {
  InterfaceCatalogReadiness,
  InterfaceMessageMeta,
  InterfaceMessagePlaceholderType,
  InterfaceTargetCatalog,
} from "./catalogTypes";

export type InterfaceMessageValue = string | number | boolean | null | undefined;

export type InterfaceMessageValues = Record<string, InterfaceMessageValue>;

export type InterfaceMessageCatalog = Record<InterfaceMessageId, string>;
