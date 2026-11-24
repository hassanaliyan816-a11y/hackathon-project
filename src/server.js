// Entry point: starts the web server.   node src/server.js
//   src/config.js    settings (environment / .env)         src/http/     requests, security, static files
//   src/domain/      the rules: issues, trust, voting       src/triage/   reading a report (rules + AI)
//   src/ai/          AI providers                           src/export/   Word reports
//   src/storage/     JSON data file
const http = require('http');
const config = require('./config');
const Store = require('./storage/store');
const LLM = require('./ai/llm');
const { createHandler } = require('./http/app');

// Starts a server. port 0 = any free port (used by the tests). Options: { rateMax } overrides the per-minute request limit.
function start(port = config.port(), options = {}) {
  Store.get();
  const handle = createHandler(options);
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => { console.error('Unhandled request error:', err); if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); } res.end('{"error":"Server error."}'); });
  });
  server.requestTimeout = 30000;   // slow or stalled clients are cut off
  server.headersTimeout = 15000;
  server.maxHeadersCount = 50;
  server.on('clientError', (err, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
  return new Promise(resolve => server.listen(port, options.host || config.host(), () => resolve(server)));
}

// A bug in one request must never take the whole server down.
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
process.on('uncaughtException', e => console.error('Uncaught exception:', e));

if (require.main === module) {
  start().then(s => {
    const { address, port } = s.address();
    console.log(`ReportFix running on http://localhost:${port}  (listening on ${address}; AI: ${LLM.enabled() ? 'on' : 'off - keyword rules only'})`);
    if (address === '127.0.0.1' || address === '::1') console.log('Only this computer can connect. To allow other devices: HOST=0.0.0.0 node src/server.js');
  });
}
module.exports = { start };
