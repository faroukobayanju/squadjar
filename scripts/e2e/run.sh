#!/usr/bin/env bash
# Forks Monad testnet on anvil :8547, runs the e2e checks against the deployed contracts, stops anvil.
set -u; cd "$(dirname "$0")/../.."; PATH="$HOME/.foundry/bin:$PATH"
anvil --fork-url "${FORK_URL:-https://testnet-rpc.monad.xyz}" --port 8547 --silent & pid=$!; trap 'kill $pid' EXIT
until cast chain-id --rpc-url http://127.0.0.1:8547 >/dev/null 2>&1; do sleep 0.5; done
node scripts/e2e/run.mjs
