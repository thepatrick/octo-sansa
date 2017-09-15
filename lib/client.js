'use strict';

const events = require('events');
const net = require('net');
const sansa = require('./sansa');

const reservedEventNames = ['on', 'ask', 'tell', 'close'];

function createClient(port, host = 'localhost', rpcInterface = {}) {
  const sansaClient = new events.EventEmitter();
  let outstandingPromises = {};
  let heartbeatInterval;
  
  sansaClient.setMaxListeners(0);

  let connection = net.createConnection(port, host);

  const parser = sansa.createParser();

  function respondToMessage(message, _err, body) {
    let err = _err;
    if (err && Object.prototype.toString.call(err) === '[object Error]') {
      err = err.toString();
    }
    connection.write(sansa.build({
      kind: 'reply',
      id: message.id,
      err,
      body,
    }));
  }

  function tell(fn, body) {
    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error(`tell(${fn}) is a reserved event name`);
    }

    if (!connection) {
      throw Error(`tell(${fn}) on client that has disconnected`);
    }

    connection.write(sansa.build({
      kind: 'tell',
      body,
      function: fn,
    }));
  }

  function ask(fn, body) {
    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error(`ask(${fn}) is a reserved event name`);
    }

    if (!connection) {
      throw Error(`ask(${fn}) on client that has disconnected`);
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString().substr(2, 5) + '-' + Math.random().toString().substr(2, 5);
      outstandingPromises[id] = { resolve, reject };
  
      connection.write(sansa.build({
        kind: 'ask',
        id,
        body,
        function: fn,
      }));
    });
  };

  function close() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (connection) {
      connection.destroy();
    }
    connection = null;
  }

  // Public API
  sansaClient.tell = tell;
  sansaClient.ask = ask;
  sansaClient.close = close;

  connection.on('connect', async () => {
    const supportedMethods = ask('octosansa.supportedMethods');

    // @TODO Ignore reservedEventNames

    supportedMethods.forEach(key => sansaClient[key] = ask.bind(undefined, key));

    sansaClient.emit('connect');

    // heartbeat every 15 seconds to keep the socket alive
    heartbeatInterval = setInterval(() => {
      if (!(connection === null || connection === undefined)) {
        connection.write(sansa.build({
          kind: 'heartbeat',
        }));
      }
    }, 15000);
  });

  parser.on('message', message => {
    const { function: fn, body, kind } = message;

    if (kind === 'tell') {
      if (rpcInterface[fn]) {
        rpcInterface[fn](body);
      } else {
        // Log a warning
      }

    } else if (kind === 'ask') {
      if (rpcInterface[fn]) {
        let response, error;
        try {
          response = await rpcInterface[fn](message.body);
        } catch (err) {
          error = err;
        }
        respondToMessage(message, error, response);
      } else {
        respondToMessage(message, new Error('Client does not understand ' + fn));
      }

    } else if (message.kind === 'reply') {
      const promise = outstandingPromises[message.id];
      delete outstandingPromises[message.id];

      if (promise) {
        if (message.err) {
          promise.reject(new Error(err));
        } else {
          promise.resolve(body);
        }
      }
    }
  });

  parser.on('error', (error) => {
    connection.close();
    return sansaClient.emit('error', error);
  });

  connection.pipe(parser);

  function cleanupPromises(err) {
    const promises = outstandingPromises;
    outstandingPromises = {};
    Object.values(promises).forEach(promise => {
      promise.reject(new Error(err));
    });
  };

  connection.on('error', err => {
    cleanupPromises('Connection error');
    sansaClient.emit('error', err);
  });

  connection.on('close', () => {
    cleanupPromises('Connection closed');
    sansaClient.emit('close');
    connection = null;
  });

  return sansaClient;
}

module.exports = createClient;
