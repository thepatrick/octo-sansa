'use strict';

const events = require('events');
const net    = require('net');
const util   = require('util');

const sansa  = require('./sansa');

function createServer() {

  const sansaServer = new events.EventEmitter();
  const _outstandingCallbacksByClient = {};

  sansaServer.setMaxListeners(0);

  const respondToMessage = function(client, message, _err, body) {
    let err = _err;
    if (err && Object.prototype.toString.call(err) === '[object Error]') {
      err = err.toString();
    }
    client.write(sansa.build({
      kind: 'reply',
      id: message.id,
      err,
      body,
    }));
  };

  const tell = function(client, fn, body) {
    client.write(sansa.build({
      kind: 'tell',
      body,
      function: fn,
    }));
  };

  const ask = function(client, fn, body, callback) {
    if (typeof callback !== 'function') {
      throw Error('ask(' + fn + ') with callback: ' + util.inspect(callback));
    }

    const id = client.sessionId + '-' + Math.random().toString().substr(2, 5);
    _outstandingCallbacksByClient[client.sessionId][id] = callback;

    client.write(sansa.build({
      kind: 'ask',
      id,
      body,
      function: fn,
    }));
  };

  const serverConnected = function(client) {

    client.sessionId = Math.random().toString().substr(2, 5);
    _outstandingCallbacksByClient[client.sessionId] = {};

    const nukeCallbacks = function(err) {
      const callbacks = _outstandingCallbacksByClient[client.sessionId];

      delete _outstandingCallbacksByClient[client.sessionId];

      for (const id in callbacks) {
        if (!callbacks.hasOwnProperty(id)) {
          continue;
        }
        callbacks[id](Error(err));
      }
    };

    client.ask = ask.bind(null, client);
    client.tell = tell.bind(null, client);

    client.on('error', err => {
      nukeCallbacks('Client error: ' + (err.message || err));
      return sansaServer.emit('client error', client, err);
    });

    client.on('close', () => {
      nukeCallbacks('Client disconnected');
      return sansaServer.emit('disconnected', client);
    });

    const parser = sansa.createParser();

    parser.on('message', message => {
      if (message.kind === 'tell') {
        client.emit(message['function'], message.body);
        sansaServer.emit(message['function'], client, message.body);

      } else if (message.kind === 'ask') {
        client.emit(message['function'], message.body, (err, response) => {
          respondToMessage(client, message, err, response);
        });
        sansaServer.emit(message['function'], client, message.body, (err, response) => {
          respondToMessage(client, message, err, response);
        });

      } else if (message.kind === 'reply') {
        if (typeof _outstandingCallbacksByClient[client.sessionId][message.id] === 'function') {
          _outstandingCallbacksByClient[client.sessionId][message.id](message.err, message.body);
          delete _outstandingCallbacksByClient[client.sessionId][message.id];
        }

      } else if (message.kind === 'heartbeat') {
        client.write(sansa.build({
          kind: 'heartbeat',
        }));
      }
    });

    parser.on('error', error => {
      client.destroy();
      sansaServer.emit('client error', client, error);
    });

    sansaServer.emit('connected', client);
    client.pipe(parser);
  };


  const server = net.createServer(client => {
    return serverConnected(client);
  });

  // Public API
  sansaServer.listen = server.listen.bind(server);
  sansaServer.address = server.address.bind(server);
  sansaServer.close = server.close.bind(server);

  return sansaServer;
}

module.exports = createServer;
