#!/usr/bin/env bash
# Builds the physics engine Wasm reproducibly: the output bytes do not depend on $HOME, $CARGO_HOME,
# the checkout directory or the target directory. CI runs this same script, so a developer build
# and the CI build are the same build.
#
#   tools/build-engine.sh            build both variants and print their SHA-256
#   tools/build-engine.sh --check    also fail unless the product build equals src/engine/orbital_engine.wasm
#   tools/build-engine.sh --update   also copy the product build to src/engine/orbital_engine.wasm
#
# Outputs (under $CARGO_TARGET_DIR, default engine/target):
#   wasm32-unknown-unknown/release/orbital_engine.wasm   product build (default features)
#   orbital_engine_diagnostics.wasm                      --features diagnostics, for tools/golden/*-kernel.mjs
#
# rustc embeds the source path of every panic location. Dependency sources live under $CARGO_HOME,
# so those paths are remapped to fixed prefixes; this is what makes the bytes machine-independent.
# Network access follows cargo's own settings (set CARGO_NET_OFFLINE=true to forbid it).
set -euo pipefail

TOOLCHAIN=1.97.0
TARGET=wasm32-unknown-unknown

mode=build
case "${1-}" in
  '') ;;
  --check) mode=check ;;
  --update) mode=update ;;
  *)
    echo "usage: tools/build-engine.sh [--check|--update]" >&2
    exit 2
    ;;
esac
[ $# -le 1 ] || {
  echo "usage: tools/build-engine.sh [--check|--update]" >&2
  exit 2
}

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
cargo_home=${CARGO_HOME:-$HOME/.cargo}
target_dir=${CARGO_TARGET_DIR:-$root/engine/target}
committed=$root/src/engine/orbital_engine.wasm
product=$target_dir/$TARGET/release/orbital_engine.wasm
diagnostics=$target_dir/orbital_engine_diagnostics.wasm

# Flags are joined with the 0x1f separator cargo expects, so paths may contain spaces.
# CARGO_ENCODED_RUSTFLAGS outranks RUSTFLAGS and every rustflags entry in cargo config files,
# so flags configured on the machine cannot leak into the build.
flags=()
remap() { flags+=("--remap-path-prefix=$1=$2"); }
remap "$root" /nemonaut
remap "$cargo_home" /cargo
# cargo may hand rustc the symlink-resolved form of either directory.
if resolved=$(cd "$cargo_home" 2>/dev/null && pwd -P) && [ "$resolved" != "$cargo_home" ]; then
  remap "$resolved" /cargo
fi
encoded=$(printf '%s\x1f' "${flags[@]}")
export CARGO_ENCODED_RUSTFLAGS=${encoded%$'\x1f'}
unset RUSTFLAGS CARGO_BUILD_RUSTFLAGS

build() {
  cargo "+$TOOLCHAIN" build --manifest-path "$root/engine/Cargo.toml" --target-dir "$target_dir" \
    --locked --release --target "$TARGET" "$@"
}

# Both variants write the same file name, so the diagnostics build goes first and is copied aside.
build --features diagnostics
cp "$product" "$diagnostics"
build

# A leftover absolute path means some source root is not remapped and the bytes depend on this machine.
if leaked=$(LC_ALL=C grep -aoE '/(home|Users|tmp|root|github|runner)/[[:print:]]{0,80}' "$product" "$diagnostics"); then
  echo "error: the Wasm embeds machine-specific paths:" >&2
  printf '%s\n' "$leaked" | sort -u | head -20 >&2
  exit 1
fi

sha256sum "$product" "$diagnostics"

case $mode in
  check)
    sha256sum "$committed"
    if ! cmp "$product" "$committed"; then
      echo "error: src/engine/orbital_engine.wasm is not the build of engine/ (run tools/build-engine.sh --update and commit it)" >&2
      exit 1
    fi
    echo "src/engine/orbital_engine.wasm matches the source build"
    ;;
  update)
    cp "$product" "$committed"
    echo "updated src/engine/orbital_engine.wasm"
    ;;
esac
