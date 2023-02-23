import * as dotenv from 'dotenv';
dotenv.config();

import { buildContext } from './context';
import { buildServer } from './server';

let PORT = process.env.PORT || 8080;

function main() {
  let context = buildContext(process.env.PG_CONN);
  let server = buildServer(context);

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => server.close());
  });

  server.on('close', () => {
    context.db_client.close();
  });

  server.listen(PORT, () => {
    console.info(`Server is running on port: ${PORT}`);
  });
}

main();
