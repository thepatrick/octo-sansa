'use strict';

/* eslint dot-notation: 0, no-unused-expressions: 0 */

/* global describe, beforeEach, it */

const { expect } = require('chai');

const sansa = require('../lib/sansa');

describe('Sansa', () => {
  describe('build', () => {
    let testBuffer;

    beforeEach(() => {
      testBuffer = sansa.build({ testObject: true });
    });

    it('returns a buffer', () => {
      expect(Buffer.isBuffer(testBuffer)).to.be.true;
    });

    it('returns a buffer of the correct length', () => {
      expect(testBuffer.length).to.equal(23);
    });

    it('returns a buffer with the the correct format', () => {
      const innerLength = testBuffer.readUInt32BE(0);
      expect(innerLength).to.equal(testBuffer.length - 4);
    });

    it('returns a buffer with a JSON stringified representation of the object', () => {
      const stringBuffer = testBuffer.slice(4, testBuffer.length);
      expect(stringBuffer.toString()).to.equal('{"testObject":true}');
    });
  });

  describe('parser', () => {
    let parser;

    beforeEach(() => {
      parser = sansa.createParser();
    });

    it('emits messages', () => {
      let x;
      parser.on('message', (msg) => {
        x = msg;
      });
      parser.write(sansa.build({ testing: 'one two three' }));
      expect(x).to.deep.equal({ testing: 'one two three' });
    });


    it('emits multiple messages', () => {
      const x = [];
      parser.on('message', (msg) => {
        x.push(msg);
      });
      parser.write(sansa.build({ testing: 'one two three' }));
      parser.write(sansa.build({ testing: 'three four five' }));
      expect(x.length).to.equal(2);
      expect(x[0]).to.deep.equal({ testing: 'one two three' });
      expect(x[1]).to.deep.equal({ testing: 'three four five' });
    });


    it('buffers incoming data until enough is received', () => {
      const x = [];
      parser.on('message', msg => x.push(msg));

      const originalMessage = sansa.build({ testing: 'one two three' });
      parser.write(originalMessage.slice(0, 4));
      expect(x.length).to.equal(0);
      parser.write(originalMessage.slice(4, originalMessage.length));
      expect(x.length).to.equal(1);
      expect(x[0]).to.deep.equal({ testing: 'one two three' });
    });

    it('barfs if someone tries to send too big a message', () => {
      let err;
      parser.on('error', (_err) => { err = _err; });
      const tempBuffer = Buffer.alloc(4);
      tempBuffer.writeUInt32BE(10485761);
      parser.write(tempBuffer);
      expect(err).to.not.be.undefined;
      expect(err.message).to.equal('Message length 10485761 bytes is greater than the 10MB limit');
    });
  });
});
