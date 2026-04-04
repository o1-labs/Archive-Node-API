#!/usr/bin/env bash
set -e
shopt -s globstar # to expand '**' into nested directories./

npm run build

# find all unit tests in build and run them (excluding live-api tests)
for f in ./build/**/*test.js; do
  # Skip live-api tests unless LIVE_API_TESTS=true
  if [[ "$f" == *"/live-api/"* ]] && [[ "$LIVE_API_TESTS" != "true" ]]; then
    echo "Skipping live-api test: $f (set LIVE_API_TESTS=true to run)"
    continue
  fi
  # Skip tests that require dedicated setup (use their own npm scripts)
  if [[ "$f" == *"/devnet-dump/"* ]] || [[ "$f" == *"/live-network/"* ]]; then
    echo "Skipping $f (run via dedicated npm script)"
    continue
  fi
  echo "Running $f"
  node --enable-source-maps --stack-trace-limit=1000 --test $f;
done
