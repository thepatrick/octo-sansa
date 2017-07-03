'use strict';

const events = require('events');
const net    = require('net');
const sansa  = require('./sansa');

const reservedEventNames = ['on'];

function createClient(port, host) {
  const sansaClient = new events.EventEmitter();
  let _outstandingCallbacks = {};
  let _heartbeatInterval;

  sansaClient.setMaxListeners(0);

  let connection = net.createConnection(port, host);

  const parser = sansa.createParser();

  const respondToMessage = function(message, _err, body) {
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
  };

  const tell = function(fn, body) {
    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error('tell(' + fn + ') is a reserved event name');
    }

    if (!connection) {
      throw Error('tell(' + fn + ') on client that has disconnected');
    }

    connection.write(sansa.build({
      kind: 'tell',
      body,
      function: fn,
    }));
  };

  const ask = function(fn, body, callback) {
    if (typeof callback !== 'function') {
      throw Error('ask(' + fn + ') with no callback');
    }

    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error('ask(' + fn + ') is a reserved event name');
    }

    if (!connection) {
      throw Error('ask(' + fn + ') on client that has disconnected');
    }

    const id = Math.random().toString().substr(2, 5) + '-' + Math.random().toString().substr(2, 5);
    _outstandingCallbacks[id] = callback;

    connection.write(sansa.build({
      kind: 'ask',
      id,
      body,
      function: fn,
    }));
  };

  const close = function() {
    if (_heartbeatInterval) {
      clearInterval(_heartbeatInterval);
      _heartbeatInterval = null;
    }
    if (connection) {
      connection.destroy();
    }
    connection = null;
  };

  // Public API
  sansaClient.tell = tell;
  sansaClient.ask = ask;
  sansaClient.close = close;

  connection.on('connect', () => {

    sansaClient.emit('connect');

    // heartbeat every 15 seconds to keep the socket alive
    _heartbeatInterval = setInterval(() => {
      if (!(connection === null || connection === undefined)) {
        connection.write(sansa.build({
          kind: 'heartbeat',
        }));
      }
    }, 15000);

  });

  parser.on('message', message => {

    if (message.kind === 'tell') {
      sansaClient.emit(message['function'], message.body);

    } else if (message.kind === 'ask') {
      sansaClient.emit(message['function'], message.body, (err, response) => {
        respondToMessage(message, err, response);
      });

    } else if (message.kind === 'reply') {
      if (typeof _outstandingCallbacks[message.id] === 'function') {
        _outstandingCallbacks[message.id](message.err, message.body);
      }
      delete _outstandingCallbacks[message.id];
    }

  });

  parser.on('error', error => {
    connection.close();
    return sansaClient.emit('error', error);
  });

  connection.pipe(parser);

  const nukeCallbacks = function(err) {
    const callbacks = _outstandingCallbacks;
    _outstandingCallbacks = {};
    for (const id in callbacks) {
      if (!callbacks.hasOwnProperty(id)) { continue; }
      callbacks[id](Error(err));
    }
  };

  connection.on('error', err => {
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
