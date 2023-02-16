import * as dotenv from 'dotenv';
dotenv.config();

import { buildServer } from './server';
let PORT = process.env.PORT || 8080;

let server = buildServer();
server.listen(PORT, () => {
  console.info(`Server is running on port: ${PORT}`);
});
