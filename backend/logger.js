// logger.js
require('dotenv').config();
const { createLogger, transports, format } = require('winston');
require('winston-mongodb');

const mongoTransport = new transports.MongoDB({
  db:          process.env.MONGO_URI,
  collection:  'logs',
  level:       'debug',       // capture everything
  options:     { useUnifiedTopology: true },
  tryReconnect:true
});

// surface the transport’s internal events
mongoTransport.on('connected', () =>  console.log('[logger] MongoDB transport connected'));
mongoTransport.on('error',     err => console.error('[logger] MongoDB transport failed:', err));

const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: 'ihwappv3' },
  transports: [
    // colored console for development
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
      level:  'debug'
    }),
    // persist into Mongo
    mongoTransport
  ],
});

module.exports = logger;
