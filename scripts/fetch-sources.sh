#!/usr/bin/env bash
# Shallow-clones the source of key libraries, at the versions this repo pins, into
# .agent_sources/ so agents can read real docs and code instead of guessing.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
dest="$repo/.agent_sources"
mkdir -p "$dest"

# Prints the version of a package pinned anywhere in the workspace, or nothing.
version_of() {
  node -e "
    const fs = require('fs');
    const path = require('path');
    const root = '$repo';
    const dirs = ['.'];
    for (const group of ['apps', 'games', 'packages']) {
      const groupDir = path.join(root, group);
      if (fs.existsSync(groupDir)) for (const name of fs.readdirSync(groupDir)) dirs.push(path.join(group, name));
    }
    for (const dir of dirs) {
      const file = path.join(root, dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const version = (pkg.dependencies || {})['$1'] || (pkg.devDependencies || {})['$1'];
      if (version) { console.log(version); process.exit(0); }
    }
  "
}

fetch() {
  local name="$1" url="$2" tag="$3"
  if [[ -z "$tag" ]]; then
    echo "skip $name (not a dependency yet)"
    return
  fi
  if [[ -d "$dest/$name/.git" ]] && [[ "$(git -C "$dest/$name" describe --tags 2>/dev/null)" == "$tag" ]]; then
    echo "ok   $name $tag"
    return
  fi
  rm -rf "${dest:?}/$name"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$tag" "$url" "$dest/$name"
  echo "got  $name $tag"
}

fiber="$(version_of @react-three/fiber)"
drei="$(version_of @react-three/drei)"
rapier="$(version_of @react-three/rapier)"
zustand="$(version_of zustand)"

fetch react-three-fiber https://github.com/pmndrs/react-three-fiber.git "${fiber:+v$fiber}"
fetch drei https://github.com/pmndrs/drei.git "${drei:+v$drei}"
fetch react-three-rapier https://github.com/pmndrs/react-three-rapier.git "${rapier:+@react-three/rapier@$rapier}"
fetch zustand https://github.com/pmndrs/zustand.git "${zustand:+v$zustand}"
