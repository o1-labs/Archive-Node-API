# Archive Node Events GraphQL Server

This GraphQL server is built to expose information from [Mina's Archive Node](https://docs.minaprotocol.com/node-operators/archive-node).

## Description

The server aims to expose zkApp related information to be used by developers and SnarkyJS. Users can query for events and actions related to their zkApp. In addition, users can filter for specific events and actions by public key, tokenId, to/from block ranges, and chain status.

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
    transactionInfo {
      status
      hash
      memo
    }
    eventData {
      index
      data
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
    transactionInfo {
      status
      hash
      memo
    }
    actionData {
      data
    }
  }
}
```

To see the data exposed, see the [GraphQL schema](./src/schema.ts).

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

- `PG_CONN`: The connection string used to connect to either a single or multiple Archive Nodes.

- `ENABLE_INTROSPECTION`: Enable or disable [GraphQL introspection](https://graphql.org/learn/introspection/). GraphQL introspection is a feature of GraphQL that allows clients to inspect the capabilities of a GraphQL server. It enables clients to discover the types, fields, and other metadata available on the server and query it using this information.

- `ENABLE_GRAPHIQL`: GraphiQL is an in-browser tool for working with GraphQL APIs. It provides a user-friendly interface for constructing and executing GraphQL queries, making it easier for developers to test and debug their GraphQL applications. GraphiQL is an excellent tool for development and testing, but it should be considered disabled in a production environment for security-related reasons.

- `ENABLE_LOGGING`: Enables logging to either Jaeger or to stdout. If `ENABLE_JAEGER` is not defined, but `ENABLE_LOGGING` is, all logs will be directed to stdout. If `ENABLE_JAEGER` is specified, all logs will be directed to the Jaeger server. Logging is done using [OpenTelemetry](https://opentelemetry.io/docs/reference/specification/overview/)

- `ENABLE_JAEGER`: Enable or disable logging to a Jaeger server. If not enabled, all logging is done through stdout.

- `JAEGER_ENDPOINT`: A URL that specifies a running Jaeger instance to send logs to. If the `./scripts/init_jaeger.sh` was run to instantiate a local instance of Jaeger, the endpoint will be `http://localhost:14268/api/traces`.

- `JAEGER_SERVICE_NAME`: The name used to specify your service within Jaeger. This name will be used to identify your specific running server.

- `PORT`: The port to be used when running the server. By default, it will use port `4000`.

- `LOG_LEVEL`: Specifies the level of logs to emit from GraphQL Yoga. [See documentation here](https://the-guild.dev/graphql/yoga-server/docs/features/logging-and-debugging) for more details.

- `CORS_ORIGIN`: Specify the CORS origin if you wish to run this server behind a proxy. By default, the server will return `Access-Control-Allow-Origin: *`.

To see an example of sensible defaults, see the [env.example](./.env.example) configuration file.

## Starting the server

To start the server, run

```sh
npm run build
npm run start
```

This will start the server and allow you to interact with the GraphQL API at `http://localhost:8080`.

In production, we recommend running this with a process control system [pm2](https://pm2.keymetrics.io/) or [Supervisor](http://supervisord.org/). In addition to using these tools, you could utilize the provided [Dockerfile](./Dockerfile) to build and run a container.

## Running tests

To run the tests, you will need a running Archive Node Postgres database to connect to. You can download a nightly dump from O(1)'s public GCP bucket if you do not have an instance running. To do so, run

```sh
./scripts/download_db.sh
./scripts/init_db.sh
```

`download_db.sh` will download the latest Archive Node SQL backup to your local machine. `init_db.sh` will use Docker to spin up a Postgres container and import the Archive Node SQL dump to be used. **Note**: You need Docker installed on your machine to run `init_db.sh`

Once you have a running Postgres instance, run the following to execute the tests:

```sh
npm run test
```

## Benchmarking

To run a benchmark on the Typescript GraphQL server, you will need to have a running Postgres instance to connect to. See the [Running tests](#running-tests) section if you still need to run the setup.

You will also need to run the server to run the benchmarks. For example, to run the server in development mode, run the following command:

```sh
npm run dev
```

Once the server is up and running, you can run the benchmarking script by using the following command:

```sh
npm run benchmark-report
```

This script will run the config defined in `benchmarking/graphql.yaml`, use the data in the `data.csv` file to fetch events/actions related to predefined addresses, and output a report in the benchmarking folder. The report will contain summarized metrics of the performance testing run against the server.

It is important to note that the benchmarking script requires the server to run to collect performance metrics. The report generated will provide valuable insights into the server's performance and help identify any potential bottlenecks or areas for improvement. Please note that running the benchmark may consume significant resources and should be done cautiously. Ensure that the server runs in a stable environment before running the benchmarking script.

## Hardware Requirements

Running the Archive Node API requires a hardware configuration that can handle the load placed on the server by user requests, with the main load being on the database. The following hardware requirements are recommended for optimal performance:

CPU: The server should have a multi-core CPU, preferably with at least four cores, to handle the concurrent user requests and database transactions. A higher core count CPU will help reduce response times and ensure faster processing of queries.

Memory: Sufficient memory is required to handle the increased load on the database. It is recommended to have at least 4GB of RAM.

Network: A high-speed internet connection is recommended to reduce latency and improve query performance. The network infrastructure should be capable of handling concurrent user requests and database transactions.

### Increased Load on the Database

The Archive Node API server will place a heavy load on the database due to the nature of the complexity of the Archive Node database schema. To fetch events and action data related to a zkApp, there are multiple complex JOINs involved to aggregate the requested data. This can cause an increased load on the database and slow down response times.

To mitigate the load on the database, it is recommended to take advantage of the multi-host connection to utilize multiple Archive Node databases. By supplying additional read-only databases for the API to connect to, queries will be spread out evenly across all databases which will help with response time. Additionally, considerations to use more powerful hardware on existing Archive Node databases should be considered.

To get an accurate sense of what hardware requirements are needed, you can utilize the [benchmarking suite](#benchmarking) to see how many requests can be handled. Simply deploy your Archive Node database to an accessible endpoint, start the server, specify the URL to use for the Archive Node database, and run the benchmarking suite to see how higher requests affect response time.

## Why are multiple blocks shown when getting event/action data at highest block of the network?

One issue with this design is deciding how to return data from the tip of the network. At the tip of the network, each block producer submits their block to be included in the Mina network. Because Mina has weaker finality, it is difficult to know which block should be returned when querying for event/action data. The OCaml Mina daemon uses a selection algorithm to estimate the chain strength of each submitted block and then decides which block to move forward with.

One solution could be porting over the selection algorithm to TypeScript and emulating the same algorithm to decide which block to return at the tip of the network. However, this does not work as the Archive Node database currently doesn’t store the data needed to run the selection algorithm that the Mina daemon has access to (mainly `last_vrf_output` and `sub_window_densities`).

Due to not knowing what block to return at the tip of the network, the API will return _all_ blocks at the tip of the network. If all the blocks contain the same transaction data, there is a high probability that the event/action data will be persisted in the network. In the rare case where some blocks contain the event/action data and some do not, we let the developer using this API handle this case for themselves (e.g. wait for additional blocks to gain confidence in finality).

This issue of deciding what to return at the tip of the network only happens at the maximum block height. All blocks below the height of the network will have one block returned and will avoid this issue. The need for this data has been raised to the current maintainers of the Archive Node. Once the Archive Node includes `last_vrf_output` and `sub_window_densities` into its schema, the selection algorithm can be implemented later to solve this issue. The issue tracking this is [listed here](https://github.com/o1-labs/Archive-Node-API/issues/7)
