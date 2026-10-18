const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');

function readLocalConfig(keys, { file = resolve(__dirname, '..', '.env'), env = process.env } = {}) {
  let saved = {};
  try { saved = parseEnv(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本地模型配置文件。'); }
  // Never import the entire file into process.env or return server secrets to client callers.
  return Object.fromEntries(keys.flatMap(key => {
    const value = env[key] ?? saved[key];
    return typeof value === 'string' ? [[key, value]] : [];
  }));
}

module.exports = { readLocalConfig };
