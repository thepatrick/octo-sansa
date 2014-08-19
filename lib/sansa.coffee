Stream = require 'stream'

build = (object)->
  packedObject = new Buffer JSON.stringify object
  combined = new Buffer 4 + packedObject.length
  combined.writeUInt32BE packedObject.length, 0, true
  packedObject.copy combined, 4
  combined

unpack = (buffer)->
  JSON.parse buffer

class Parser extends Stream
  constructor: ->
    Stream.call @
    @_buffer = new Buffer 0
  
  writable: true
  
  write: (data, encoding)->
    unless @writable
      throw Error "Parser has been destroyed"
    
    newBuffer = if Buffer.isBuffer data
      data
    else
      new Buffer data, encoding
    
    combinedBuffer = new Buffer(@_buffer.length + newBuffer.length)
    
    @_buffer.copy   combinedBuffer
    newBuffer.copy  combinedBuffer, @_buffer.length
    
    @_buffer = combinedBuffer
    
    process.nextTick =>  # allow time for event listeners to register
      @parseBuffer()
    
    if @destroyAfterNextParse
      process.nextTick =>
        @destroy()
    
    else if @endAfterNextParse
      process.nextTick =>
        @end()
    
    true
    
  end: (data, encoding)->
    if data?
      @endAfterNextParse = true
      @write data, encoding
    else
      @destroy()
      @emit 'end'
  
  destroy: ->
    @_buffer = null
    @writable = false
      
  parseBuffer: ->
    while @_buffer.length >= 4
      length = @_buffer.readUInt32BE 0, true
      
      # Messages are limited to 10MB at present
      if length > 10485760
        @destroy()
        @emit 'error', Error "Message length #{length} bytes is greater than the 10MB limit"
        break
      
      # Sufficient data to continue?
      if @_buffer.length < (4 + length)
        break
      
      # Read payload
      messageBuffer = @_buffer.slice 4, 4 + length
      
      # Trim buffer
      remainingBuffer = new Buffer @_buffer.length - (4 + length)
      @_buffer.copy remainingBuffer, 0, 4 + length
      @_buffer = remainingBuffer
      
      # Emit message
      @emit 'message', unpack(messageBuffer)
      
      # (rinse and repeat...)

exports.createParser = ->
  new Parser
exports.build = build
