var events = require('events'),
    net    = require('net'),
    sansa  = require('./sansa');

function createClient(port, host) {
  var sansaClient = new events.EventEmitter(),
      _outstandingCallbacks = {},
      _heartbeatInterval,
      ask,
      close,
      connection,
      nukeCallbacks,
      parser,
      respondToMessage,
      tell;

  sansaClient.setMaxListeners(0);

  connection = net.createConnection(port, host);

  parser = sansa.createParser();

  connection.on('connect', function() {

    sansaClient.emit('connect');

    // heartbeat every 15 seconds to keep the socket alive
    _heartbeatInterval = setInterval(function() {
      if (connection != null) {
        connection.write(sansa.build({
          kind: 'heartbeat'
        }));
      }
    }, 15000);

  });

  parser.on('message', function(message) {

    if (message.kind === 'tell') {
      sansaClient.emit(message['function'], message.body);

    } else if (message.kind === 'ask') {
      sansaClient.emit(message['function'], message.body, function(err, response) {
        respondToMessage(message, err, response);
      });

    } else if (message.kind === 'reply') {
      if (typeof _outstandingCallbacks[message.id] === 'function') {
        _outstandingCallbacks[message.id](message.err, message.body);
      }
      delete _outstandingCallbacks[message.id];
    }

  });
  
  parser.on('error', function(error) {
    connection.close();
    return sansaClient.emit('error', error);
  });

  connection.pipe(parser);

  nukeCallbacks = function(err) {
    var callbacks = _outstandingCallbacks,
        id;
    _outstandingCallbacks = {};
    for (id in callbacks) {
      if (!callbacks.hasOwnProperty(id)) continue;
      callbacks[id](Error(err));
    }
  };

  connection.on('error', function(err) {
    nukeCallbacks('Connection error');
    sansaClient.emit('error', err);
  });

  connection.on('close', function() {
    nukeCallbacks('Connection closed');
    sansaClient.emit('close');
    connection = null;
  });

  respondToMessage = function(message, err, body) {
    if (err && Object.prototype.toString.call(err) === '[object Error]') {
      err = err.toString();
    }
    connection.write(sansa.build({
      kind: 'reply',
      id: message.id,
      err: err,
      body: body
    }));
  };

  tell = function(fn, body) {
    connection.write(sansa.build({
      kind: 'tell',
      body: body,
      'function': fn
    }));
  };

  ask = function(fn, body, callback) {
    if (callback == null) {
      throw Error('ask(' + fn + ') with no callback');
    }

    var id = Math.random().toString().substr(2, 5) + '-' + Math.random().toString().substr(2, 5);
    _outstandingCallbacks[id] = callback;
    
    connection.write(sansa.build({
      kind: 'ask',
      id: id,
      body: body,
      'function': fn
    }));
  };
  
  close = function() {
    if (_heartbeatInterval != null) {
      clearInterval(_heartbeatInterval);  
      _heartbeatInterval = null;    
    }
    if (connection != null) {
      connection.destroy();
    }
    connection = null;
  };

  // Public API
  sansaClient.tell = tell;
  sansaClient.ask = ask;
  sansaClient.close = close;

  return sansaClient;
}

module.exports = createClient;