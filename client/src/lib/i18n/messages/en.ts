import { INTERFACE_MESSAGE_IDS, interfaceSourceMessages, type InterfaceMessageCatalog } from "@/lib/i18n/messages/types";

export const enMessages: InterfaceMessageCatalog = Object.fromEntries(
  INTERFACE_MESSAGE_IDS.map((id) => [id, interfaceSourceMessages[id].defaultMessage]),
) as InterfaceMessageCatalog;
