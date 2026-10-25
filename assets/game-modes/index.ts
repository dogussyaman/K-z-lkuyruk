export const gameModeImages = {
  classic: require('./classic.jpg'),
  survival: require('./survival.jpg'),
  suspicious: require('./suspicious.jpg'),
  blitz: require('./blitz.jpg'),
  team_battle: require('./team_battle.jpg'),
  secret_missions: require('./secret_missions.jpg'),
  double_trap: require('./double_trap.jpg'),
  golden_question: require('./golden_question.jpg'),
  detective_fox: require('./detective_fox.jpg'),
} as const;

export type GameModeImageKey = keyof typeof gameModeImages;
