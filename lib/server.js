var events = require('events'),
    net    = require('net'),
    util   = require('util'),

    sansa  = require('./sansa');

function createServer() {

  var sansaServer = new events.EventEmitter(),
      _outstandingCallbacksByClient = {},
      ask,
      respondToMessage,
      server,
      serverConnected,
      tell;

  sansaServer.setMaxListeners(0);

  server = net.createServer(function(client) {
    return serverConnected(client);
  });

  serverConnected = function(client) {
    var nukeCallbacks,
        parser;

    client.sessionId = Math.random().toString().substr(2, 5);
    _outstandingCallbacksByClient[client.sessionId] = {};

    nukeCallbacks = function(err) {
      var callbacks = _outstandingCallbacksByClient[client.sessionId],
          id;

      delete _outstandingCallbacksByClient[client.sessionId];
      
      for (id in callbacks) {
        if (!callbacks.hasOwnProperty(id)) {
          continue;
        }
        callbacks[id](Error(err));
      }
    };

    client.ask = ask.bind(null, client);
    client.tell = tell.bind(null, client);

    client.on('error', function(err) {
      nukeCallbacks('Client error');
      return sansaServer.emit('client error', client, err);
    });

    client.on('close', function() {
      nukeCallbacks('Client disconnected');
      return sansaServer.emit('disconnected', client);
    });

    parser = sansa.createParser();

    parser.on('message', function(message) {
      if (message.kind === 'tell') {
        client.emit(message['function'], message.body);
        sansaServer.emit(message['function'], client, message.body);

      } else if (message.kind === 'ask') {
        client.emit(message['function'], message.body, function(err, response) {
          respondToMessage(client, message, err, response);
        });
        sansaServer.emit(message['function'], client, message.body, function(err, response) {
          respondToMessage(client, message, err, response);
        });

      } else if (message.kind === 'reply') {
        if (typeof _outstandingCallbacksByClient[client.sessionId][message.id] === 'function') {
          _outstandingCallbacksByClient[client.sessionId][message.id](message.err, message.body);
          delete _outstandingCallbacksByClient[client.sessionId][message.id];
        }

      } else if (message.kind === 'heartbeat') {
        client.write(sansa.build({
          kind: 'heartbeat'
        }));
      }
    });

    parser.on('error', function(error) {
      client.destroy();
      sansaServer.emit('client error', client, error);
    });

    sansaServer.emit('connected', client);
    client.pipe(parser);
  };

  respondToMessage = function(client, message, err, body) {
    if (err && Object.prototype.toString.call(err) === '[object Error]') {
      err = err.toString();
    }
    client.write(sansa.build({
      kind: 'reply',
      id: message.id,
      err: err,
      body: body
    }));
  };

  tell = function(client, fn, body) {
    client.write(sansa.build({
      kind: 'tell',
      body: body,
      'function': fn
    }));
  };

  ask = function(client, fn, body, callback) {
    if (typeof callback !== 'function') {
      throw Error('ask(' + fn + ') with callback: ' + util.inspect(callback));
    }

    var id = client.sessionId + '-' + Math.random().toString().substr(2, 5);
    _outstandingCallbacksByClient[client.sessionId][id] = callback;

    client.write(sansa.build({
      kind: 'ask',
      id: id,
      body: body,
      'function': fn
    }));
  };

  sansaServer.listen = server.listen.bind(server);
  sansaServer.address = server.address.bind(server);
  sansaServer.close = server.close.bind(server);

  return sansaServer;
}

module.exports = createServer;
