import type { Member } from "@treehouse/kit/net";
import { useDeviceProfile } from "@treehouse/kit/profile";
import { useEffect, useState } from "react";
import { GAMES } from "./games.ts";

// The home screen. First visit on a device: "who are you?" with big avatar buttons.
// After that: one tile per game, and the shared games show who's playing right now.

const params = new URLSearchParams(location.search);

export function App() {
  const { family, profile, error, choose } = useDeviceProfile();
  const [picking, setPicking] = useState(params.has("pick"));

  if (error) return <main className="center">📡</main>;
  if (!family) return <main className="center">🌱</main>;
  if (!profile || picking) {
    return (
      <Picker
        family={family}
        current={profile?.id}
        onPick={(id) => {
          choose(id);
          setPicking(false);
          const next = params.get("next");
          if (next?.startsWith("/") && !next.startsWith("//")) location.href = next;
        }}
      />
    );
  }

  return (
    <main>
      <header>
        <h1>🌳 Treehouse</h1>
        <button
          type="button"
          className="me"
          style={{ borderColor: profile.color }}
          data-testid="me"
          onClick={() => setPicking(true)}
        >
          <span className="me-avatar">{profile.avatar}</span>
          <span className="me-name">{profile.name}</span>
        </button>
      </header>
      <Tiles family={family} />
    </main>
  );
}

function Picker({
  family,
  current,
  onPick,
}: {
  family: Member[];
  current?: string | undefined;
  onPick(id: string): void;
}) {
  return (
    <main className="picker" data-testid="picker">
      <h1>👋❓</h1>
      <div className="picker-grid">
        {family.map((member) => (
          <button
            key={member.id}
            type="button"
            className={`pick${member.id === current ? " pick-current" : ""}`}
            style={{ background: member.color }}
            data-testid={`pick-${member.id}`}
            onClick={() => onPick(member.id)}
          >
            <span className="pick-avatar">{member.avatar}</span>
            <span className="pick-name">{member.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

interface WorldSummary {
  game: string;
  world: string;
  online: Member[];
}

function Tiles({ family }: { family: Member[] }) {
  const [worlds, setWorlds] = useState<WorldSummary[]>([]);
  useEffect(() => {
    let stopped = false;
    const load = () =>
      fetch("/api/worlds")
        .then((response) => (response.ok ? response.json() : []))
        .then((data: WorldSummary[]) => !stopped && setWorlds(data))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  if (GAMES.length === 0) {
    return (
      <div className="empty" data-testid="no-games">
        🛠️🌱
      </div>
    );
  }
  return (
    <nav className="tiles">
      {GAMES.map((game) => {
        const online = game.world
          ? (worlds.find((w) => w.game === game.world?.game && w.world === game.world?.world)
              ?.online ?? [])
          : [];
        return (
          <a
            key={game.id}
            className="tile"
            href={`/games/${game.id}/`}
            style={{ background: game.color }}
            data-testid={`tile-${game.id}`}
          >
            <span className="emoji">{game.emoji}</span>
            <span className="title">{game.title}</span>
            {online.length > 0 && (
              <span className="playing">
                {online.map((member) => (
                  <span
                    key={member.id}
                    className="playing-avatar"
                    style={{ borderColor: family.find((m) => m.id === member.id)?.color }}
                  >
                    {member.avatar}
                  </span>
                ))}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
