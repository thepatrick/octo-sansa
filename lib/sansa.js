var Writable = require('stream').Writable;

exports.build = function(object) {
  var packedObject = new Buffer(JSON.stringify(object)),
      combined = new Buffer(4 + packedObject.length);

  combined.writeUInt32BE(packedObject.length, 0, true);
  packedObject.copy(combined, 4);
  
  return combined;
};

exports.createParser = function() {
  var incomingBuffer = new Buffer(0),
      writable = new Writable({ decodeStrings: false }),
      parseBuffer;
  
  parseBuffer = function() {
    var results = [],
        length,
        messageBuffer,
        remainingBuffer,
        results;

    while (incomingBuffer.length >= 4) {

      length = incomingBuffer.readUInt32BE(0, true);

      // Messages are limited to 10MB at present
      if (length > 10485760) {
        writable.emit('error', Error('Message length ' + length +
          ' bytes is greater than the 10MB limit'));
        break;
      }

      // Sufficient data to continue?
      if (incomingBuffer.length < (4 + length)) {
        break;
      }

      // Read payload      
      messageBuffer = incomingBuffer.slice(4, 4 + length);

      // Remove current payload from incomingBuffer
      remainingBuffer = new Buffer(incomingBuffer.length - (4 + length));
      incomingBuffer.copy(remainingBuffer, 0, 4 + length);
      incomingBuffer = remainingBuffer;

      // Emit message
      results.push(writable.emit('message', JSON.parse(messageBuffer)));

      // (rinse and repeat...)

    }
  };

  writable._write = function(chunk, encoding, next) {
    var combinedBuffer,
        newBuffer;

    // Convert to chunk to a buffer (it really really should be one already)
    newBuffer = Buffer.isBuffer(chunk) ? chunk : new Buffer(chunk, encoding);

    // Create a new buffer that will fit the existing incomingBuffer & the new chunk
    // and copy them both into it.
    combinedBuffer = new Buffer(incomingBuffer.length + newBuffer.length);
    incomingBuffer.copy(combinedBuffer);
    newBuffer.copy(combinedBuffer, incomingBuffer.length);
    incomingBuffer = combinedBuffer;

    // Parse anything that we can out of the resulting incomingBuffer
    parseBuffer();

    // Next!
    next();
  };

  return writable;
};
