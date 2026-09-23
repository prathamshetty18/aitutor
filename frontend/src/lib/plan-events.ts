/**
 * plan-events.ts — tiny client-side event bus so the chat can tell the
 * dashboard "the study plan / SWOT / goals just changed — refresh".
 *
 * Kept dependency-free with a plain listener Set. The dashboard subscribes on
 * mount, refetches goals on ping, and closes stale banners on logout.
 */

type Listener = () => void;

let listeners: Listener[] = [];

export function subscribePlanUpdates(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getPlanUpdateNotifier() {
  return {
    notify() {
      listeners.forEach((l) => l());
    },
  };
}
