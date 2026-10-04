// Sets the family passcode. Writes the passcode hash and a fresh session secret to the
// server env file (outside git). A fresh secret signs every device out.
//
//   pnpm passcode:set "carrot moon"     use this passcode
//   pnpm passcode:set --generate        pick a random two-word passcode and print it
import { randomBytes, randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { hashPasscode } from "../apps/server/src/hash.ts";

const WORDS = [
  "apple",
  "acorn",
  "bunny",
  "carrot",
  "clover",
  "daisy",
  "duck",
  "fern",
  "frog",
  "garden",
  "goat",
  "honey",
  "kitten",
  "lemon",
  "maple",
  "meadow",
  "moon",
  "mushroom",
  "otter",
  "owl",
  "pebble",
  "pony",
  "pumpkin",
  "rainbow",
  "robin",
  "seed",
  "sheep",
  "sunny",
  "tulip",
  "turnip",
];

const ENV_FILE = join(homedir(), ".config", "treehouse", "server.env");

function pick(): string {
  return WORDS[randomInt(WORDS.length)] ?? "treehouse";
}

const argument = process.argv[2];
if (!argument) {
  console.error('Usage: pnpm passcode:set "<passcode>" | --generate');
  process.exit(1);
}
const passcode = argument === "--generate" ? `${pick()} ${pick()}` : argument;

mkdirSync(dirname(ENV_FILE), { recursive: true });
writeFileSync(
  ENV_FILE,
  [
    `TREEHOUSE_PASSCODE_HASH=${hashPasscode(passcode)}`,
    `TREEHOUSE_SECRET=${randomBytes(32).toString("base64url")}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log(`Passcode set in ${ENV_FILE}. Restart the server: systemctl --user restart treehouse`);
if (argument === "--generate") console.log(`New family passcode: ${passcode}`);
