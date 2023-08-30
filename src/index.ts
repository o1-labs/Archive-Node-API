import * as dotenv from 'dotenv';
dotenv.config();

import { buildContext } from './context';
import { buildServer } from './server';

const PORT = process.env.PORT || 8080;

(async function main() {
  try {
    const context = await buildContext(process.env.PG_CONN);
    const server = await buildServer(context);

    server.listen(PORT, () => {
      console.info(`Server is running on port: ${PORT}`);
    });

    ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
      process.on(signal, () => server.close());
    });

    server.on('close', async () => {
      await context.db_client.close();
      process.exit(0); // normal termination
    });
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1); // exit with an error code
  }
})();
