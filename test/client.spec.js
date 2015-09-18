'use strict';

const sinon = require('sinon');
const mockery = require('mockery');
const expect = require('chai').expect;
const EventEmitter = require('events').EventEmitter;

/* eslint dot-notation: 0, no-unused-expressions: 0*/
/* global describe, beforeEach, afterEach, it */

describe('Client', () => {
  let netStub, sansaStub, createClient, parserStub, connectionStub, testClient;

  beforeEach(() => {
    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
      useCleanCache: true,
    });

    connectionStub = new EventEmitter();
    connectionStub.write = sinon.stub();
    connectionStub.close = sinon.stub();
    connectionStub.pipe = sinon.stub();
    connectionStub.destroy = sinon.stub();

    netStub = {
      createConnection: sinon.stub().returns(connectionStub),
    };

    parserStub = new EventEmitter();

    sansaStub = {
      build: sinon.stub(),
      createParser: sinon.stub().returns(parserStub),
    };

    // replace the module `request` with a stub object
    mockery.registerMock('net', netStub);
    mockery.registerMock('./sansa', sansaStub);

    createClient = require('../lib/client');
    testClient = createClient(1234, 'some-host');
  });

  afterEach(() => {
    testClient.close();
    mockery.disable();
  });

  describe('connect', () => {

    it('connects to a server', () => {
      expect(netStub.createConnection.calledWithExactly(1234, 'some-host')).to.equal(true);
    });

    it('emits an error if the socket triggers an error', () => {
      connectionStub.emit('connect');

      const error = sinon.stub();
      testClient.on('error', error);

      connectionStub.emit('error');

      expect(error.called, 'error.called').to.equal(true);
    });

    it('emits an error if the parser triggers an error', () => {
      connectionStub.emit('connect');

      const error = sinon.stub();
      testClient.on('error', error);

      parserStub.emit('error');

      expect(error.called, 'error.called').to.equal(true);
    });
    
  });

  describe('events', () => {

    it('emits a connect event', () => {
      const connected = sinon.stub();
      testClient.on('connect', connected);

      connectionStub.emit('connect');

      expect(connected.called, 'connected.called').to.equal(true);
    });

    it('emits on tell messages', () => {
      connectionStub.emit('connect');

      const tell = sinon.stub();

      testClient.on('test tell', tell);

      parserStub.emit('message', {
        kind: 'tell',
        function: 'test tell',
        body: 'test body',
      });

      expect(tell.calledWithExactly('test body')).to.equal(true);
    });

    it('emits on ask messages', () => {
      connectionStub.emit('connect');

      const ask = sinon.stub();

      testClient.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      expect(ask.calledWithExactly('test body', sinon.match.func)).to.equal(true);
    });

    it('provides a callback with an ask event', () => {
      connectionStub.emit('connect');

      const ask = sinon.stub();

      testClient.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[1]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[1]();

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', undefined);
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(connectionStub.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with a body', () => {
      connectionStub.emit('connect');

      const ask = sinon.stub();

      testClient.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[1]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[1](undefined, 'test reply');

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', 'test reply');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(connectionStub.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with an error object', () => {
      connectionStub.emit('connect');

      const ask = sinon.stub();

      testClient.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[1]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[1](new Error('test error'));

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('err', 'Error: test error');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(connectionStub.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with an error string', () => {
      connectionStub.emit('connect');

      const ask = sinon.stub();

      testClient.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[1]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[1]('test error');

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('err', 'test error');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(connectionStub.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

  });

  describe('send messages', () => {

    it('sends tell messages', () => {
      sansaStub.build.returns('test-tell-built');

      testClient.tell('test tell', 'test body');

      expect(sansaStub.build.args[0][0]).to.deep.equal({
        body: 'test body',
        function: 'test tell',
        kind: 'tell',
      });
      expect(connectionStub.write.calledWithExactly('test-tell-built')).to.equal(true);
    });

    it('sends ask messages', () => {
      sansaStub.build.returns('test-ask-built');

      testClient.ask('test ask', 'test body', () => {});

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', 'test body');
      expect(lastBuild).to.have.property('function', 'test ask');
      expect(lastBuild).to.have.property('kind', 'ask');
      expect(lastBuild).to.have.property('id');

      expect(connectionStub.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('invokes an ask callback on reply without a body', () => {
      sansaStub.build.returns('test-ask-built');

      const reply = sinon.stub();

      testClient.ask('test ask', 'test body', reply);

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('id');

      parserStub.emit('message', {
        kind: 'reply',
        id: lastBuild.id,
      });

      expect(reply.lastCall.args[0]).to.be.undefined;
      expect(reply.lastCall.args[1]).to.be.undefined;
    });

    it('invokes an ask callback on reply with a body', () => {
      sansaStub.build.returns('test-ask-built');

      const reply = sinon.stub();

      testClient.ask('test ask', 'test body', reply);

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('id');

      parserStub.emit('message', {
        kind: 'reply',
        id: lastBuild.id,
        body: 'test reply',
      });

      expect(reply.lastCall.args[0]).to.be.undefined;
      expect(reply.lastCall.args[1]).to.equal('test reply');
    });

    it('invokes an ask callback on reply with an error', () => {
      sansaStub.build.returns('test-ask-built');

      const reply = sinon.stub();

      testClient.ask('test ask', 'test body', reply);

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('id');

      parserStub.emit('message', {
        kind: 'reply',
        id: lastBuild.id,
        err: 'test error',
      });

      expect(reply.lastCall.args[0]).to.equal('test error');
      expect(reply.lastCall.args[1]).to.be.undefined;
    });

    it('throws on an ask without a callback', () => {
      expect(() => {
        testClient.ask('test ask without callback', 'body');
      }).to.throw('ask(test ask without callback) with no callback');
    });
  });

});
