events = require 'events'
net    = require 'net'

sansa = require './sansa'

class Server extends events.EventEmitter

  constructor: ->
    events.EventEmitter.call @

    @setMaxListeners 0

    @_outstandingCallbacksByClient = {}

    @server = net.createServer (client)=>
      @serverConnected(client)
    
  listen: (port, callback)->
    @server.listen arguments...

  address: ->
    @server.address arguments...

  serverConnected: (client)->
    client.sessionId = Math.random().toString().substr(2, 5)
    @_outstandingCallbacksByClient[client.sessionId] = {}

    nukeCallbacks = (err)=>
      callbacks = @_outstandingCallbacksByClient[client.sessionId]
      delete @_outstandingCallbacksByClient[client.sessionId]
      for own id, fn of callbacks
          fn Error err

    client.on 'error', (err)=>
      nukeCallbacks 'Client error'
      @emit 'client error', client, err

    client.on 'close', =>
      nukeCallbacks 'Client disconnected'
      @emit 'disconnected', client

    parser = sansa.createParser()
    client.pipe parser

    @emit 'connected', client

    parser.on 'message', (message)=>
      if message.kind == 'tell'
        @emit message.function, client, message.body
      else if message.kind == 'ask'
        @emit message.function, client, message.body, (err, response)=>
          @respondToMessage client, message, err, response
      else if message.kind == 'reply'
        @_outstandingCallbacksByClient[client.sessionId][message.id]? message.err, message.body
        delete @_outstandingCallbacksByClient[client.sessionId][message.id]
      else if message.kind == 'heartbeat'
        client.write sansa.build kind: 'heartbeat'

    parser.on 'error', (error)=>
      client.destroy()
      @emit 'client error', client, error

  respondToMessage: (client, message, err, body)->
    if err && Object.prototype.toString.call(err) == '[object Error]'
      err = err.toString()
    resp = sansa.build kind: 'reply', id: message.id, err: err, body: body
    client.write resp

  tell: (client, fn, body)->
    resp = sansa.build kind: 'tell', body: body, function: fn
    client.write resp

  ask: (client, fn, body, callback)->
    throw Error("ask(#{fn}) with no callback") unless callback?
    id = client.sessionId + '-' + Math.random().toString().substr(2, 5)
    @_outstandingCallbacksByClient[client.sessionId][id] = callback
    resp = sansa.build kind: 'ask', id: id, body: body, function: fn
    client.write resp

  close: ->
    try @server.close() catch err

module.exports = ->
  new Server
