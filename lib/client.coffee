events  = require 'events'
net     = require 'net'

sansa = require './sansa'

class Client extends events.EventEmitter

  constructor: (port, host)->
    events.EventEmitter.call @

    @setMaxListeners 0

    @_outstandingCallbacks = {}

    @connection = new net.createConnection port, host

    parser = sansa.createParser()

    @connection.on 'connect', =>
      @emit 'connect'

      @heartbeatInterval = setInterval =>
        @connection?.write sansa.build kind: 'heartbeat'
      , 15000 # heartbeat every 15 seconds just in case

    @connection.pipe parser


    parser.on 'message', (message)=>
      if message.kind == 'tell'
        @emit message.function, message.body
      else if message.kind == 'ask'
        @emit message.function, message.body, (err, response)=>
          @respondToMessage message, err, response
      else if message.kind == 'reply'
        @_outstandingCallbacks[message.id]? message.err, message.body
        delete @_outstandingCallbacks[message.id]

    parser.on 'error', (error)=>
      client.destroy()
      @emit 'error', error
    
    nukeCallbacks = =>
      callbacks = @_outstandingCallbacks
      delete @_outstandingCallbacks
      for own id, fn of callbacks
          fn Error err
      
    @connection.on 'error', (err)=>
      @emit 'error', err

    @connection.on 'close', =>
      @emit 'close'
      @connection = null

  respondToMessage: (message, err, body)->
    if err && Object.prototype.toString.call(err) == '[object Error]'
      err = err.toString()
    resp = sansa.build kind: 'reply', id: message.id, err: err, body: body
    @connection.write resp

  tell: (fn, body)->
    resp = sansa.build kind: 'tell', body: body, function: fn
    @connection.write resp

  ask: (fn, body, callback)->
    throw Error("ask(#{fn}) with no callback") unless callback?
    id = Math.random().toString().substr(2, 5) + '-' + Math.random().toString().substr(2, 5)
    @_outstandingCallbacks[id] = callback
    resp = sansa.build kind: 'ask', id: id, body: body, function: fn
    @connection.write resp

  close: ->
    clearInterval @heartbeatInterval
    @connection?.destroy()
    @connection = null

module.exports = (port, host)->
  new Client port, host
