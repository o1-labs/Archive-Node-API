# Archive Node Events GraphQL Server

This GraphQL server is built to expose information from [Mina's Archive Node](https://docs.minaprotocol.com/node-operators/archive-node).

## Description

The server aims to expose zkApp related information to be used by developers and o1js. Users can query for events and actions related to their zkApp. In addition, users can filter for specific events and actions by public key, tokenId, to/from block ranges, and chain status.

An example query for events and actions looks like this:

```graphql
query getEvents {
  events(input: { address: "B62..." }) {
    blockInfo {
      stateHash
      timestamp
      ledgerHash
      height
      parentHash
      chainStatus
      distanceFromMaxBlockHeight
      globalSlotSinceGenesis
    }
    eventData {
      data
    }
    transactionInfo {
      status
      hash
      memo
    }
  }
}

query getActions {
  actions(input: { address: "B62..." }) {
    blockInfo {
      stateHash
      timestamp
      ledgerHash
      height
      parentHash
      chainStatus
      distanceFromMaxBlockHeight
      globalSlotSinceGenesis
    }
    actionState {
      actionStateOne
      actionStateTwo
      actionStateThree
      actionStateFour
      actionStateFive
    }
    actionData {
      data
      transactionInfo {
        status
        hash
        memo
      }
    }
  }
}
```

To see the data exposed, see the [GraphQL schema](./schema.graphql).

The server lets operators connect to an existing Archive Node Postgres database and provides application monitoring with [Jaeger](https://github.com/jaegertracing/jaeger).

Finally, the server provides a set of environment variables to configure runtime options such as database connections, CORS origin, logging behaviour, etc.

## Connecting to a Postgres database

The server will use the `PG_CONN` environment variable to establish a connection to a running Archive Node. Note that `PG_CONN` is a connection string, so the expected format looks like `'postgres://postgres:password@localhost:5432/archive'`

The server additionally supports multi-host connections for high availability if you are running multiple Archive Nodes. For example, numerous connection strings can be passed to `PG_CONN` as `'postgres://localhost:5432,localhost:5433'`. This works the same as the native `psql` command. Read more at [multiple host URIs](https://www.postgresql.org/docs/13/libpq-connect.html#LIBPQ-MULTIPLE-HOSTS).

Connections will be attempted in order of the specified hosts/ports. On a successful connection, all retries will be reset. This ensures that hosts can come up and down seamlessly.

## Connecting to a Jaeger server for logging

To run an instance of Jaeger locally, see the [init_jaeger script](./scripts/init_jaeger.sh). By running the script, a local instance of Jaeger will be instantiated with Docker with default environment variables. If you run it as is, you can access the Jaeger dashboard by visiting `http://localhost:16686`.

To enable logging to Jaeger, set the following environment variables:

```sh
ENABLE_JAEGER="true"
JAEGER_SERVICE_NAME="archive-api"
JAEGER_ENDPOINT='http://localhost:14268/api/traces'
```

`ENABLE_JAEGER`: Tells the server to allow Jaeger logging. If Jaeger logging is not enabled, all logs will be printed to stdout.

`JAEGER_ENDPOINT`: The specified URL for the running Jaeger service.

`JAEGER_SERVICE_NAME`: Specifies the service name to be used by Jaeger. The service name will be what identifies the service in the Jaeger logs.

Also, note that Jaeger supports distributed logging. This means that if you're running multiple instances of this server, you can specify the same Jaeger endpoint. All your logs will be consolidated in one place for simplified logging across all your server instances.

## Environment Variables

This section aims to describe all the environment variables exposed to configure runtime behaviour:

- `APP_COMMAND`: The command to run the server. A sensible default is `npm run start`.

- `PG_CONN`: The connection string used to connect to either a single or multiple Archive Nodes.

- `ENABLE_INTROSPECTION`: Enable or disable [GraphQL introspection](https://graphql.org/learn/introspection/). GraphQL introspection is a feature of GraphQL that allows clients to inspect the capabilities of a GraphQL server. It enables clients to discover the types, fields, and other metadata available on the server and query it using this information.

- `ENABLE_GRAPHIQL`: GraphiQL is an in-browser tool for working with GraphQL APIs. It provides a user-friendly interface for constructing and executing GraphQL queries, making it easier for developers to test and debug their GraphQL applications. GraphiQL is an excellent tool for development and testing, but it should be considered disabled in a production environment for security-related reasons.

- `ENABLE_LOGGING`: Enables logging to either Jaeger or to stdout. If `ENABLE_JAEGER` is not defined, but `ENABLE_LOGGING` is, all logs will be directed to stdout. If `ENABLE_JAEGER` is specified, all logs will be directed to the Jaeger server. Logging is done using [OpenTelemetry](https://opentelemetry.io/docs/reference/specification/overview/)

- `ENABLE_JAEGER`: Enable or disable logging to a Jaeger server. If not enabled, all logging is done through stdout.

- `JAEGER_ENDPOINT`: A URL that specifies a running Jaeger instance to send logs to. If the `./scripts/init_jaeger.sh` was run to instantiate a local instance of Jaeger, the endpoint will be `http://localhost:14268/api/traces`.

- `JAEGER_SERVICE_NAME`: The name used to specify your service within Jaeger. This name will be used to identify your specific running server.

- `PORT`: The port to be used when running the server. By default, it will use port `8080`.

- `LOG_LEVEL`: Specifies the level of logs to emit from GraphQL Yoga. [See documentation here](https://the-guild.dev/graphql/yoga-server/docs/features/logging-and-debugging) for more details.

- `CORS_ORIGIN`: Specify the CORS origin if you wish to run this server behind a proxy. By default, the server will return `Access-Control-Allow-Origin: *`.

To see an example of sensible defaults, see the [env.example](./.env.example) configuration file.

## Installing from npm

This package is published to npm and is available for public access

```sh
npm install mina-archive-node-graphql
```

## Installing from artifact registry

This package is published to a Google Cloud Artifact Registry and is available for public access.

**Configure npm to use the registry:**

```sh
npm config set registry https://europe-southwest1-npm.pkg.dev/o1labs-192920/euro-npm/
```

**Install the package:**

```sh
# Install the latest stable version
npm install archive-node-graphql

# Or install a specific version
npm install archive-node-graphql@1.2.3

# Or install the latest dev version
npm install archive-node-graphql@dev
```

## Creating a Release

To create a new release, follow these steps:

1. **Update version in package.json**: `npm version <major|minor|patch>`
2. **Commit the version change**: `git commit -am "Release v1.2.3"`
3. **Create and push a tag**: `git tag v1.2.3 && git push origin v1.2.3`

The CI/CD workflow will automatically:

- Build and publish npm package to GCP registry with version from package.json
- Build and push Docker image to both GCP Artifact Registry and GitHub Container Registry
- Create semantic version tags (e.g., `1.2.3`, `1.2`, `1`, `latest`)

**Published artifacts:**

- npm: `https://europe-southwest1-npm.pkg.dev/o1labs-192920/euro-npm/`
- Docker (GCP): `europe-west3-docker.pkg.dev/o1labs-192920/euro-docker-repo/archive-node-api`
- Docker (GitHub): `ghcr.io/o1-labs/archive-node-api`

## Starting the server

To start the server, run

```sh
npm run build
npm run start
```

or in development mode, run

```sh
npm run dev
```

This will start the server and allow you to interact with the GraphQL API specified with the port defined in your `.env` file or port `8080` by deafult. e.g. `http://localhost:3000`.

In production, we recommend running this with a process control system [pm2](https://pm2.keymetrics.io/) or [Supervisor](http://supervisord.org/). In addition to using these tools, you could utilize the provided [Dockerfile](./Dockerfile) to build and run a container.

## Running tests

To run the tests, you will need a running instance of [Lightnet](https://docs.minaprotocol.com/zkapps/testing-zkapps-lightnet). Lightnet will start a running Postgres instance with a local Mina network and will populate the database with zkApp related data. To run the tests, you will have to run a zkApp script to emit events and actions to the database. To do this, ensure you have Lightnet [running on your local machine](https://docs.minaprotocol.com/zkapps/testing-zkapps-lightnet#start-a-single-node-network) and then run the following commands:

```sh
node --loader ts-node/esm benchmark/setup.ts
```

This will run a script that will deploy a zkApp and emit events and actions to the database. Once the script is finished, you can run the tests with the following command:

```sh
npm run test
```

## Benchmarking

To run a benchmark on the Typescript GraphQL server, you will need to have a running Lightnet instance to connect to. See the [Running tests](#running-tests) section if you still need to run the setup.

You will also need to run the server to run the benchmarks. For example, to run the server in development mode, run the following command:

```sh
npm run dev
```

Once the server is up and running, you can run the benchmarking script by using the following command:

```sh
npm run benchmark
```

This script will run the config defined in `benchmarking/graphql.yaml` and output a report in the benchmarking folder. The report will contain summarized metrics of the performance testing run against the server.

It is important to note that the benchmarking script requires the server to run to collect performance metrics. The report generated will provide valuable insights into the server's performance and help identify any potential bottlenecks or areas for improvement. Please note that running the benchmark may consume significant resources and should be done cautiously. Ensure that the server runs in a stable environment before running the benchmarking script.

## Hardware Requirements

Running the Archive Node API requires a hardware configuration that can handle the load placed on the server by user requests, with the primary load being on the database. This API is written to be resource efficient; the main bottleneck is expected to be on the database performance, not the Archive Node API process.

### Increased Load on the Database

To mitigate the load on the database, it is recommended to use the multi-host connection to utilize multiple Archive Node databases. By supplying additional read-only databases for the API to connect to, queries will be spread evenly across all databases, which will help with response time. Additionally, the use of more powerful hardware on existing Archive Node databases should be considered.

To get a real sense of what hardware requirements are needed, you can utilize the [benchmarking suite](#benchmarking) to see how many requests can be handled.

For example, a benchmark report is shown below and was run with an Archive Node API and Postgres database container running on the same machine with a 12-core processor & 32GB of RAM.

```
--------------------------------------
Metrics for period to: 19:05:30(-0800) (width: 9.999s)
--------------------------------------

http.codes.200: ................................................................ 7908
http.request_rate: ............................................................. 794/sec
http.requests: ................................................................. 7915
http.response_time:
  min: ......................................................................... 1
  max: ......................................................................... 54
  median: ...................................................................... 15
  p95: ......................................................................... 30.9
  p99: ......................................................................... 39.3
http.responses: ................................................................ 7908
vusers.completed: .............................................................. 7907
vusers.created: ................................................................ 7916
vusers.created_by_name.Get Actions: ............................................ 3885
vusers.created_by_name.Get Events: ............................................. 4031
vusers.failed: ................................................................. 0
vusers.session_length:
  min: ......................................................................... 2.4
  max: ......................................................................... 55.5
  median: ...................................................................... 16
  p95: ......................................................................... 32.1
  p99: ......................................................................... 40
```

## Setting Up Local Development Environment Using zkApp-CLI Lightnet

To set up a local development environment, you can use the [zkApp-CLI Lightnet](https://docs.minaprotocol.com/zkapps/testing-zkapps-lightnet). This tool allows you to run a local Mina network with zkApps enabled. The zkApp-CLI Lightnet will also start a running Postgres instance with a local Mina network and will populate the database with zkApp related data. Once you have the zkApp-CLI Lightnet running, you can run the server and interact with the GraphQL API.

To see how to set up the zkApp-CLI Lightnet, see the [zkApp-CLI Lightnet documentation](https://docs.minaprotocol.com/zkapps/testing-zkapps-lightnet#start-a-local-network).

If you wish to populate the database with zkApp related data, you can run the following commands:

```sh
node --loader ts-node/esm benchmark/setup.ts
```

This will run a script that will deploy a zkApp and emit events and actions to the database. Once the script is finished, you can run the server with the following command:

```sh
npm run dev
```

To ensure you have the correct environment variables set up, you can see a copy of the `.env.example.lightnet` file.

Generally, it is recommended that you use Lightnet as your local development environment, as it will provide you with a running Mina network and a Postgres instance with zkApp related data.

## Setting Up Local Development Environment Using Docker Compose

The provided `docker-compose.yml` file simplifies the process of setting up a local development environment. This file orchestrates the creation of a Docker network comprising of Mina daemon, Archive Node, GraphQL server, and Jaeger. Follow the steps below to get everything up and running:

**Step 1: Libp2p Keypair Generation**

You will need a libp2p keypair for the setup. If you don't already have one, you can easily generate a keypair specifically for local development (note: this should not be used in production). Use the script provided in the repository:

```bash
./scripts/generate_libp2p.sh
```

**Step 2: Update Environment Variables**

Once you have generated the keypair, make sure to update your `.env` file with the passwords that were used during the keypair generation process.

**Step 3: Launch the Docker Network**

With the prerequisites in place, start the Docker network by running the following command in your terminal:

```bash
docker compose up
```

This command pulls the necessary Docker images and launches them, setting up a local environment ideal for server development. This setup offers a way to connec to a live running Mina network, specified by it's seed peers and Mina daemon build. Use this setup to test the server's functionality and performance against a live running network.
