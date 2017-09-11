'use strict';

const events = require('events');
const net = require('net');
const sansa = require('./sansa');

const reservedEventNames = ['on'];

function createClient(port, host) {
  const sansaClient = new events.EventEmitter();
  let outstandingCallbacks = {};
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

  function ask(fn, body, callback) {
    if (typeof callback !== 'function') {
      throw Error(`ask(${fn}) with no callback`);
    }

    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error(`ask(${fn}) is a reserved event name`);
    }

    if (!connection) {
      throw Error(`ask(${fn}) on client that has disconnected`);
    }

    const id = `${Math.random().toString().substr(2, 5)}-${Math.random().toString().substr(2, 5)}`;
    outstandingCallbacks[id] = callback;

    connection.write(sansa.build({
      kind: 'ask',
      id,
      body,
      function: fn,
    }));
  }

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

  connection.on('connect', () => {
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

  parser.on('message', (message) => {
    if (message.kind === 'tell') {
      sansaClient.emit(message.function, message.body);
    } else if (message.kind === 'ask') {
      sansaClient.emit(message.function, message.body, (err, response) => {
        respondToMessage(message, err, response);
      });
    } else if (message.kind === 'reply') {
      if (typeof outstandingCallbacks[message.id] === 'function') {
        outstandingCallbacks[message.id](message.err, message.body);
      }
      delete outstandingCallbacks[message.id];
    }
  });

  parser.on('error', (error) => {
    connection.close();
    return sansaClient.emit('error', error);
  });

  connection.pipe(parser);

  function nukeCallbacks(err) {
    const callbacks = outstandingCallbacks;
    outstandingCallbacks = {};
    Object.values(callbacks).forEach(callback => callback(new Error(err)));
  }

  connection.on('error', (err) => {
    nukeCallbacks('Connection error');
    sansaClient.emit('error', err);
  });

  connection.on('close', () => {
    nukeCallbacks('Connection closed');
    sansaClient.emit('close');
    connection = null;
  });

  return sansaClient;
}

module.exports = createClient;
