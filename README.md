# Archive Node Events GraphQL Server

This is a GraphQL server that is built with the intention of exposing information from [Mina's Archive Node](https://docs.minaprotocol.com/node-operators/archive-node).

## Description

The server aims to expose zkApp related information to be used by developers and SnarkyJS. Users can query for events and actions related to their zkApp. In addition, users can filter for specific events and actions by public key, tokenId, to/from block ranges, and chain status.

An example query for event and actions looks like this:

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

Additionally, the server lets operators connect to an existing Archive Node Postgres database and provides application monitoring with [Jaeger](https://github.com/jaegertracing/jaeger).

Finally, the server provides a set of environment variables to configure runtime options such as database connections, CORS origin, logging behaviour, etc.

## Connecting to a Postgres database

The server will use the `PG_CONN` environment variable to establish a connection to a running Archive Node. Note that `PG_CONN` is a connection string, so the expected format looks like `'postgres://postgres:password@localhost:5432/archive'`

The server additionally supports multi-host connections for high availability if you are running multiple Archive Nodes. For example, multiple connection strings can be passed to `PG_CONN` in the form of `'postgres://localhost:5432,localhost:5433'`. This works the same as the native psql command. Read more at [multiple host URIs](https://www.postgresql.org/docs/13/libpq-connect.html#LIBPQ-MULTIPLE-HOSTS).

Connections will be attempted in order of the specified hosts/ports. On a successful connection, all retries will be reset. This ensures that hosts can come up and down seamlessly.

## Connecting to a Jaeger server for logging

To run an instance of Jaeger locally, see the [init_jaeger script](./scripts/init_jaeger.sh). By running the script, a local instance of Jaeger will be instantiated with Docker with default environment variables. If you run it as is, you can access the Jaeger dashboard by visiting `http://localhost:16686`.

To enable logging to Jaeger, set the following environment variables:
`ENABLE_JAEGER=true`
`JAEGER_ENDPOINT='http://localhost:14268/api/traces'`
`JAEGER_SERVICE_NAME='archive'`

`ENABLE_JAEGER`: Tells the server to allow Jaeger logging. If Jaeger logging is not enabled, all logs will be printed to stdout.

`JAEGER_ENDPOINT`: The specified URL for the running Jaeger service.

`JAEGER_SERVICE_NAME`: Specifies the service name to be used by Jaeger. The service name will be what identifies the service in the Jaeger logs.

Also, note that Jaeger supports distributed logging. This means that if you're running multiple instances of this server, you can specify the same Jaeger endpoint. All your logs will be consolidated in one place for simplified logging across all your server instances.

## Environment Variables

This section aims to describe all the environment variables exposed to configure runtime behaviour:

`PG_CONN`: The connection string used to connect to either a single or multiple Archive Nodes.

`ENABLE_INTROSPECTION`: Enable or disable [GraphQL introspection](https://graphql.org/learn/introspection/). GraphQL introspection is a feature of GraphQL that allows clients to inspect the capabilities of a GraphQL server. It enables clients to discover the types, fields, and other metadata available on the server and to query the server using this information.

`ENABLE_GRAPHIQL`: GraphiQL is an in-browser tool for working with GraphQL APIs. It provides a user-friendly interface for constructing and executing GraphQL queries, making it easier for developers to test and debug their GraphQL applications. GraphiQL is an excellent tool for development and testing, but it should be considered disabled in a production environment.

`ENABLE_JAEGER`: Enable or disable logging to a Jaeger server. If not enabled, all logging is done through stdout.

`JAEGER_ENDPOINT`: A URL that specifies a running Jaeger instance to send logs to. If the `./scripts/init_jaeger.sh` was run to instantiate a local instance of Jaeger, the endpoint will be `http://localhost:14268/api/traces`.

`JAEGER_SERVICE_NAME`: The name used to specify your service within Jaeger. This name will be used to identify your specific running server.

`PORT`: The port to be used when running the server. By default, it will use port `4000`.

`CORS_ORIGIN`: Specify the CORS origin if you wish to run this server behind a proxy. By default, the server will return `Access-Control-Allow-Origin: *`.`

For an example of some sensible defaults, see below:

```sh
PG_CONN='postgres://postgres:password@localhost:5432/archive'
ENABLE_INTROSPECTION=true
ENABLE_GRAPHIQL=true
ENABLE_JAEGER=true
JAEGER_ENDPOINT='http://localhost:14268/api/traces'
JAEGER_SERVICE_NAME='archive'
```

## Starting the server

To start the server, run

```sh
npm run start
```

This will start the server and allow you to interact with the GraphQL API at `http://localhost:4000`.

## Benchmarking

To run a benchmark on the Typescript GraphQL server, you need to start the server by using the following command:

```sh
npm run dev
```

Once the server is up and running, you can run the benchmarking script by using the following command:

```sh
npm run benchmark-report
```

This script will run the config defined in `benchmarking/graphql.yaml`, make use of the data in the `data.csv` file to fetch events/actions related to predefined addresses, and output a report in the benchmarking folder. The report will contain summarized metrics of the performance testing run against the server.

It is important to note that the benchmarking script requires the server to be running in order to collect performance metrics. The report generated will provide valuable insights into the server's performance and help identify any potential bottlenecks or areas for improvement. Please note that running the benchmark may consume significant resources and should be done with caution. Ensure that the server is running in a stable environment before running the benchmarking script.
