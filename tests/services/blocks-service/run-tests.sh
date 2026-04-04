#!/usr/bin/env bash
set -e
npm run build
node --enable-source-maps --stack-trace-limit=1000 --test ./build/tests/services/blocks-service/blocks-service.test.js
