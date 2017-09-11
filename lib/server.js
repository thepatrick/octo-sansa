'use strict';

const events = require('events');
const net = require('net');

const sansa = require('./sansa');

const reservedEventNames = ['on'];

function createServer() {
  const sansaServer = new events.EventEmitter();
  const outstandingCallbacksByClient = {};

  sansaServer.setMaxListeners(0);

  function respondToMessage(client, message, _err, body) {
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
  }

  function tell(client, fn, body) {
    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error(`tell(${fn}) is a reserved event name`);
    }

    if (!client.isConnected) {
      throw Error(`tell(${fn}) on client that has disconnected`);
    }

    client.write(sansa.build({
      kind: 'tell',
      body,
      function: fn,
    }));
  }

  function ask(client, fn, body, callback) {
    if (typeof callback !== 'function') {
      throw Error(`ask(${fn}) with no callback`);
    }

    if (reservedEventNames.indexOf(fn) >= 0) {
      throw Error(`ask(${fn}) is a reserved event name`);
    }

    if (!client.isConnected) {
      throw Error(`ask(${fn}) on client that has disconnected`);
    }

    const id = `${client.sessionId}-${Math.random().toString().substr(2, 5)}`;
    outstandingCallbacksByClient[client.sessionId][id] = callback;

    client.write(sansa.build({
      kind: 'ask',
      id,
      body,
      function: fn,
    }));
  }

  function serverConnected(client) {
    // eslint-disable-next-line no-param-reassign
    client.sessionId = Math.random().toString().substr(2, 5);
    outstandingCallbacksByClient[client.sessionId] = {};

    function nukeCallbacks(err) {
      const callbacks = outstandingCallbacksByClient[client.sessionId];

      delete outstandingCallbacksByClient[client.sessionId];

      Object.values(callbacks).forEach(callback => callback(new Error(err)));
    }

    // eslint-disable-next-line no-param-reassign
    client.isConnected = true;
    // eslint-disable-next-line no-param-reassign
    client.ask = ask.bind(null, client);
    // eslint-disable-next-line no-param-reassign
    client.tell = tell.bind(null, client);

    client.on('error', (err) => {
      // eslint-disable-next-line no-param-reassign
      client.isConnected = false;
      nukeCallbacks(`Client error: ${err.message || err}`);
      return sansaServer.emit('client error', client, err);
    });

    client.on('close', () => {
      // eslint-disable-next-line no-param-reassign
      client.isConnected = false;
      nukeCallbacks('Client disconnected');
      return sansaServer.emit('disconnected', client);
    });

    const parser = sansa.createParser();

    parser.on('message', (message) => {
      if (message.kind === 'tell') {
        client.emit(message.function, message.body);
        sansaServer.emit(message.function, client, message.body);
      } else if (message.kind === 'ask') {
        client.emit(message.function, message.body, (err, response) => {
          respondToMessage(client, message, err, response);
        });
        sansaServer.emit(message.function, client, message.body, (err, response) => {
          respondToMessage(client, message, err, response);
        });
      } else if (message.kind === 'reply') {
        if (typeof outstandingCallbacksByClient[client.sessionId][message.id] === 'function') {
          outstandingCallbacksByClient[client.sessionId][message.id](message.err, message.body);
          delete outstandingCallbacksByClient[client.sessionId][message.id];
        }
      } else if (message.kind === 'heartbeat') {
        client.write(sansa.build({
          kind: 'heartbeat',
        }));
      }
    });

    parser.on('error', (error) => {
      // eslint-disable-next-line no-param-reassign
      client.isConnected = false;
      client.emit('client error', error);
      client.destroy();
      sansaServer.emit('client error', client, error);
    });

    sansaServer.emit('connected', client);
    client.pipe(parser);
  }


  const server = net.createServer(client => serverConnected(client));

  // Public API
  sansaServer.listen = server.listen.bind(server);
  sansaServer.address = server.address.bind(server);
  sansaServer.close = server.close.bind(server);

  return sansaServer;
}

module.exports = createServer;
