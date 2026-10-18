const { createGateway } = require('./gateway.cjs');
const { readLocalConfig } = require('../scripts/local-config.cjs');

function start() {
  const config = readLocalConfig(['AGNES_API_KEY', 'STUDIO_GATEWAY_TOKEN', 'STUDIO_GATEWAY_HOST', 'STUDIO_GATEWAY_PORT']);
  const host = config.STUDIO_GATEWAY_HOST || '127.0.0.1';
  const port = Number(config.STUDIO_GATEWAY_PORT || '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('STUDIO_GATEWAY_PORT 必须为有效端口。');
  const server = createGateway({ apiKey: config.AGNES_API_KEY, serviceToken: config.STUDIO_GATEWAY_TOKEN });
  server.on('error', () => { console.error('Agnes 网关无法启动，请检查监听地址和端口。'); process.exitCode = 1; });
  server.listen(port, host, () => { console.log('Agnes 网关已启动。'); });
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    server.closeAllConnections();
    server.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  return server;
}

if (require.main === module) {
  try { start(); }
  catch { console.error('Agnes 网关未启动：请配置 AGNES_API_KEY、至少 32 位的 STUDIO_GATEWAY_TOKEN 和有效端口。'); process.exitCode = 1; }
}

module.exports = { start };
