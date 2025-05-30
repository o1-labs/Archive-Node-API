# Mina Archive Node GraphQL API

This project is a GraphQL API and web UI for querying actions and events from the Mina archive node database.


You can either:
- Connect to a live archive node's Postgres DB to serve live, updating chain data
- Download a snapshot from an archive node database (e.g. for mainnet or devnet)

---

# Running with a DB Snapshot
If you're debugging a zkApp or integration that uses the archive node API and you need to reproduce a bug or issue you've seen on mainnet or devnet, then running this project locally from a db dump is the fastest way to do that.

Instead of syncing a full archive node, you can download a snapshot of the Postgres database and run the API locally via `docker-compose`. This gives you full access to block history, events, and actions up to the point at which the db dump was downloaded.


### Requirements
- Docker & Docker Compose
- Node.js
---

### 1. Clone the Repository and Install Dependencies

1. Clone the repository:
    ```bash
    git clone https://github.com/o1-labs/archive-node-api
    cd Archive-Node-API
    ```

2. Install the required dependencies and build the project:
    ```bash
    npm i
    npm run build
    ```

3. Copy the example environment file:
    ```bash
    cp .env.example.compose .env
    ```

---

### 2. Download the Database Snapshot

1. Run the script to download the database snapshot. 
    - This downloads the latest `mainnet` dump by default, or you can specify `devnet` as `./scripts/download_db.sh devnet`
    ```bash
    ./scripts/download_db.sh
    ```
---

### 3. Start the API with Docker Compose

1. Start the API using Docker Compose:
    ```bash
    docker-compose up
    ```

2. Once the containers are running, the GraphQL UI will be available at `http://localhost:8080`
    - Initializing postgres can take a while!
---

### 4. Verify the Setup

1. Run the following GraphQL query to check the block height:
    ```graphql
    {
      networkState {
         maxBlockHeight {
            canonicalMaxBlockHeight
            pendingMaxBlockHeight
         }
      }
    }
    ```

2. Compare the resulting block height with what you see on [MinaScan](https://minascan.io/mainnet/home) for the corresponding network (e.g., mainnet or devnet).


# Running Only Postgres and Jaeger
If you're actively developing or debugging the GraphQL API, you can run just the required infrastructure services through docker and then run the api with npm. 

1. Update your .env file to connect to the services exposed by docker
```shell
PG_CONN=postgres://postgres:password@localhost:5432/archive
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```
2. Start Postgres and Jaeger
```shell
docker-compose up postgres jaeger
```
3. Start the API server 

```shell
npm run start
```
Once running, the GraphQL UI will be available at http://localhost:8080.