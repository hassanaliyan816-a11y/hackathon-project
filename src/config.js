// One place for settings. Values come from environment variables (or .env) and are read when needed, so tests can change them.
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch { /* no .env: AI is simply off */ }

const int = (key, fallback) => { const n = parseInt(process.env[key], 10); return Number.isFinite(n) && n > 0 ? n : fallback; };

module.exports = {
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  BODY_LIMIT_BYTES: 20000,                     // largest request body accepted
  port: () => int('PORT', 3000),
  host: () => process.env.HOST || '127.0.0.1', // localhost only; set HOST=0.0.0.0 to let other devices on the network connect
  rateLimitPerMin: () => int('REPORTFIX_RATE_LIMIT', 300),   // API requests per minute per client address
  maxStudents: () => int('REPORTFIX_MAX_STUDENTS', 300),     // cap on created accounts
  llmCallsPerMin: () => int('REPORTFIX_LLM_PER_MIN', 40),    // cap on AI requests per minute (protects your free quota)
};
