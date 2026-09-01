export const GAME_END_REASONS = Object.freeze({
  TIMER_EXPIRED: "timer-expired",
  PRACTICE_EXITED: "practice-exited",
  ABANDONED: "abandoned",
});

export function saveTargetForGameEnd(durationSeconds, reason) {
  if (durationSeconds === null) {
    return reason === GAME_END_REASONS.PRACTICE_EXITED ? "practice" : null;
  }

  return reason === GAME_END_REASONS.TIMER_EXPIRED ? "score" : null;
}
