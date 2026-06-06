'use strict';

process.stdout.write('[START] node ' + process.version + '\n');
process.stdout.write('[START] PORT=' + process.env.PORT + '\n');
process.stdout.write('[START] NODE_ENV=' + process.env.NODE_ENV + '\n');
process.stdout.write('[START] DATABASE_URL=' + (process.env.DATABASE_URL ? 'SET (length=' + process.env.DATABASE_URL.length + ')' : 'MISSING') + '\n');

try {
  process.stdout.write('[START] loading dist/app.js...\n');
  require('./dist/app.js');
  process.stdout.write('[START] dist/app.js loaded\n');
} catch (e) {
  process.stdout.write('[START] FATAL: ' + e.message + '\n');
  process.stdout.write(e.stack + '\n');
  process.exit(1);
}
