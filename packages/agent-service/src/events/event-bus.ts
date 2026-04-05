import { EventEmitter } from 'events';
import { AgentEvent, EventHandler, EventType } from '../core/types';

export interface IEventBus {
  emit(event: AgentEvent): void;
  on(event: EventType, handler: EventHandler): void;
  off(event: EventType, handler: EventHandler): void;
  once(event: EventType, handler: EventHandler): void;
}

export class EventBus implements IEventBus {
  private emitter: EventEmitter = new EventEmitter();

  emit(event: AgentEvent): void {
    this.emitter.emit(event.type, event);
  }

  on(event: EventType, handler: EventHandler): void {
    this.emitter.on(event, handler);
  }

  off(event: EventType, handler: EventHandler): void {
    this.emitter.off(event, handler);
  }

  once(event: EventType, handler: EventHandler): void {
    this.emitter.once(event, handler);
  }
}

let globalEventBus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}
