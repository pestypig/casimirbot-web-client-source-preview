// lib/luma-bus.ts - Simple event bus for Luma whispers
type LumaEventHandler = (payload: any) => void;

const eventBus = new Map<string, Map<string, LumaEventHandler>>();

let idCounter = 0;

export function subscribe(eventType: string, handler: LumaEventHandler): string {
  const handlerId = `handler_${++idCounter}`;
  
  if (!eventBus.has(eventType)) {
    eventBus.set(eventType, new Map());
  }
  
  eventBus.get(eventType)!.set(handlerId, handler);
  return handlerId;
}

export function unsubscribe(handlerId: string) {
  for (const [eventType, handlers] of Array.from(eventBus.entries())) {
    if (handlers.has(handlerId)) {
      handlers.delete(handlerId);
      if (handlers.size === 0) {
        eventBus.delete(eventType);
      }
      return true;
    }
  }
  return false;
}

export function publish(eventType: string, payload: any) {
  const handlers = eventBus.get(eventType);
  if (handlers) {
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Error in Luma event handler for ${eventType}:`, error);
      }
    });
  }
}