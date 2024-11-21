#!/usr/bin/env bash
set -e
shopt -s globstar # to expand '**' into nested directories./

npm run build

# find all unit tests in build and run them
for f in ./build/**/*test.js; do
  echo "Running $f"
  node --enable-source-maps --stack-trace-limit=1000 --test $f;
done
