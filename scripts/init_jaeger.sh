#!/usr/bin/env bash
set -x
set -eo pipefail

# For information on these environment variables, see here: https://www.jaegertracing.io/docs/1.41/getting-started/
JAEGER_FRONTEND="${JAEGER_FRONTEND:=16686}"
JAEGER_LOG_PORT="${JAEGER_LOG_PORT:=14268}"


CONTAINER_NAME="jaeger_$(date '+%s')"

# if a jaeger container is running, print instructions to kill it and exit
RUNNING_JAEGER_CONTAINER=$(docker ps --filter 'name=jaeger' --format '{{.ID}}')
if [[ -n $RUNNING_JAEGER_CONTAINER ]]; then
  echo >&2 "there is a jaeger container already running, kill it with"
  echo >&2 "    docker kill ${RUNNING_JAEGER_CONTAINER}"
  docker kill ${RUNNING_JAEGER_CONTAINER}
fi

# Launch jaeger docker container
docker run -d \
  -e COLLECTOR_ZIPKIN_HTTP_PORT=9411 \
  -p 5775:5775/udp \
  -p 6831:6831/udp \
  -p 6832:6832/udp \
  -p 5778:5778 \
  -p "${JAEGER_FRONTEND}":16686 \
  -p "${JAEGER_LOG_PORT}":14268 \
  -p 9411:9411 \
  --name ${CONTAINER_NAME} \
  jaegertracing/all-in-one:latest
