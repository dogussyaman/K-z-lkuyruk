export interface TestBot {
  player_id: string;
  personality: 'scholar' | 'balanced' | 'trickster';
}

interface BotPhaseOptions {
  loadBots: () => Promise<TestBot[]>;
  takeTurn: (botId: string) => Promise<unknown>;
  delayFor: (bot: TestBot) => number;
  isExpired: () => boolean;
  onError: (error: unknown) => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
}

// Each effect owns one independent schedule. Cleanup cancels that schedule,
// while a subsequent setup (including Strict Mode replay) starts a fresh one.
export function startBotPhase({
  loadBots, takeTurn, delayFor, isExpired, onError,
  schedule = setTimeout, cancel = clearTimeout,
}: BotPhaseOptions): () => void {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const active = () => !stopped && !isExpired();
  const later = (action: () => void, delay: number) => {
    if (!active()) return;
    const timer = schedule(() => {
      timers.delete(timer);
      if (active()) action();
    }, delay);
    timers.add(timer);
  };
  const attempt = async (action: () => Promise<unknown>, tries = 0): Promise<void> => {
    if (!active()) return;
    try {
      await action();
    } catch (error) {
      if (!active()) return;
      if (tries < 2) later(() => { void attempt(action, tries + 1); }, 750);
      else onError(error);
    }
  };
  void attempt(async () => {
    const bots = await loadBots();
    if (!active()) return;
    for (const bot of bots) {
      later(() => { void attempt(() => takeTurn(bot.player_id)); }, delayFor(bot));
    }
  });
  return () => {
    stopped = true;
    timers.forEach(cancel);
    timers.clear();
  };
}
