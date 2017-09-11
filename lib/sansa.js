'use strict';

const { Writable } = require('stream');

exports.build = function build(object) {
  const packedObject = Buffer.from(JSON.stringify(object));
  const combined = Buffer.allocUnsafe(4 + packedObject.length);
  combined.writeUInt32BE(packedObject.length, 0, true);
  packedObject.copy(combined, 4);

  return combined;
};

exports.createParser = function createParser() {
  let incomingBuffer = Buffer.alloc(0);
  const writable = new Writable({ decodeStrings: false });

  function parseBuffer() {
    const results = [];

    while (incomingBuffer.length >= 4) {
      const length = incomingBuffer.readUInt32BE(0, true);

      // Messages are limited to 10MB at present
      if (length > 10485760) {
        writable.emit('error', Error(`Message length ${length
        } bytes is greater than the 10MB limit`));
        break;
      }

      // Sufficient data to continue?
      if (incomingBuffer.length < (4 + length)) {
        break;
      }

      // Read payload
      const messageBuffer = incomingBuffer.slice(4, 4 + length);

      // Remove current payload from incomingBuffer
      const remainingBuffer = Buffer.allocUnsafe(incomingBuffer.length - (4 + length));
      incomingBuffer.copy(remainingBuffer, 0, 4 + length);
      incomingBuffer = remainingBuffer;

      // Emit message
      results.push(writable.emit('message', JSON.parse(messageBuffer)));

      // (rinse and repeat...)
    }
  }

  // eslint-disable-next-line no-underscore-dangle
  writable._write = function write(chunk, encoding, next) {
    // Convert to chunk to a buffer (it really really should be one already)
    const newBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

    // Create a new buffer that will fit the existing incomingBuffer & the new chunk
    // and copy them both into it.
    const combinedBuffer = Buffer.allocUnsafe(incomingBuffer.length + newBuffer.length);
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
