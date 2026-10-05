#!/usr/bin/env bash
# Regenerates the ABIs the app imports. Run after any contract change.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p abi
for c in AjoNGN TrustRegistry SquadFactory Squad; do
  forge inspect "$c" abi --json > "abi/$c.json"
done
echo "ABIs written to contracts/abi/"
