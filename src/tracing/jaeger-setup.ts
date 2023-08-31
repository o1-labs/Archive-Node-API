import { request } from 'node:http';

export { validateJaegerConfig, parseEndpoint, checkJaegerEndpointAvailability };

function validateJaegerConfig(endpoint: string): void {
  if (!endpoint) {
    throw new Error(
      'Jaeger was enabled but no endpoint was specified. Please ensure that the Jaeger endpoint is properly configured and available.'
    );
  }

  if (!process.env.JAEGER_SERVICE_NAME) {
    throw new Error(
      'Jaeger was enabled but no service name was specified. Please ensure that the Jaeger service name is properly configured.'
    );
  }
}

function parseEndpoint(endpoint: string): { hostname: string; port: string } {
  const strippedEndpoint = endpoint.replace(/(^\w+:|^)\/\//, '');
  const [hostname, portSegment] = strippedEndpoint.split(':');
  const port = portSegment?.split('/')[0];
  return { hostname, port };
}

function checkJaegerEndpointAvailability({
  hostname,
  port,
}: {
  hostname: string;
  port: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname,
      method: 'GET',
      port,
      path: '/',
      timeout: 2000,
    });

    req.on('error', () => {
      reject(
        new Error(
          'Jaeger endpoint not available. Please ensure that the Jaeger endpoint is properly configured and available.'
        )
      );
    });

    req.on('timeout', () => {
      reject(
        new Error(
          'Jaeger endpoint timed out. Please ensure that the Jaeger endpoint is properly configured and available.'
        )
      );
    });

    req.on('response', () => {
      resolve();
      req.end();
    });

    req.end();
  });
}
