// Every game shown on the home screen. A game appears here once it builds to
// dist/site/games/<id>/. `world` marks shared games, so the tile can show who is playing.
export interface GameEntry {
  id: string;
  title: string;
  emoji: string;
  color: string;
  world?: { game: string; world: string };
}

export const GAMES: readonly GameEntry[] = [
  // new-game: entries
];
