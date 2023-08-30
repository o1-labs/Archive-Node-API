import * as dotenv from 'dotenv';
dotenv.config();

import { buildContext } from './context';
import { buildServer } from './server';

const PORT = process.env.PORT || 8080;

(async function main() {
  const context = await buildContext(process.env.PG_CONN);
  const server = await buildServer(context);

  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => server.close());
  });
  server.on('close', async () => {
    await context.db_client.close();
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.info(`Server is running on port: ${PORT}`);
  });
})();
