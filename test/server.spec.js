'use strict';

const sinon = require('sinon');
const mockery = require('mockery');
const expect = require('chai').expect;
const EventEmitter = require('events').EventEmitter;

/* eslint dot-notation: 0, no-unused-expressions: 0*/
/* global describe, beforeEach, afterEach, it */

describe('Server', () => {
  let netStub, sansaStub, createServer, parserStub, serverStub, testServer;

  const fakeNewClient = () => {
    const connectionStub = new EventEmitter();
    connectionStub.write = sinon.stub();
    connectionStub.close = sinon.stub();
    connectionStub.pipe = sinon.stub();
    connectionStub.destroy = sinon.stub();
    return connectionStub;
  };

  beforeEach(() => {
    mockery.enable({
      warnOnReplace: false,
      warnOnUnregistered: false,
      useCleanCache: true,
    });

    serverStub = new EventEmitter();
    serverStub.address = sinon.stub();
    serverStub.listen = sinon.stub();
    serverStub.close = sinon.stub();

    netStub = {
      createServer: sinon.stub().returns(serverStub),
    };

    parserStub = new EventEmitter();

    sansaStub = {
      build: sinon.stub(),
      createParser: sinon.stub().returns(parserStub),
    };

    // replace the module `request` with a stub object
    mockery.registerMock('net', netStub);
    mockery.registerMock('./sansa', sansaStub);

    createServer = require('../lib/server');
    testServer = createServer();
  });

  afterEach(() => {
    testServer.close();
    mockery.disable();
  });

  describe('createServer', () => {
    it('creates a server', () => {
      expect(netStub.createServer.calledWithExactly(sinon.match.func)).to.equal(true);
    });

    it('listens on the chosen port', () => {
      testServer.listen(8080);
      expect(serverStub.listen.calledWithExactly(8080)).to.equal(true);
    });
  });

  describe('incoming connections', () => {
    let serverConnected, connected, testClient;

    beforeEach(() => {
      serverConnected = netStub.createServer.args[0][0];
      connected = sinon.stub();
      testServer.on('connected', connected);
      testClient = fakeNewClient();
      serverConnected(testClient);
    });

    it('emits a connected event', () => {
      expect(connected.calledWithExactly(testClient), 'connected.called').to.equal(true);
    });

    it('assigns a session id', () => {
      expect(testClient.sessionId, 'testClient.sessionId').not.to.be.undefined;
    });

    it('emits a client error on parser errors', () => {
      const clientError = sinon.stub();
      const fakeError = new Error('fake error');
      testServer.on('client error', clientError);
      parserStub.emit('error', fakeError);
      expect(clientError.calledWithExactly(testClient, fakeError), 'clientError').to.equal(true);
      expect(testClient.destroy.called, 'client.close').to.equal(true);
    });

    it('emits a client error on socket errors', () => {
      const clientError = sinon.stub();
      const fakeError = new Error('fake error');
      testServer.on('client error', clientError);
      testClient.emit('error', fakeError);
      expect(clientError.calledWithExactly(testClient, fakeError), 'clientError').to.equal(true);
    });

    it('emits a close event on socket close', () => {
      const clientDisconnected = sinon.stub();
      testServer.on('disconnected', clientDisconnected);
      testClient.emit('close');
      expect(clientDisconnected.calledWithExactly(testClient),
        'clientDisconnected').to.equal(true);
    });

    it('emits on tell messages', () => {
      const tell = sinon.stub();
      testServer.on('test tell', tell);

      parserStub.emit('message', {
        kind: 'tell',
        function: 'test tell',
        body: 'test body',
      });

      expect(tell.calledWithExactly(testClient, 'test body')).to.equal(true);
    });

    it('emits on ask messages', () => {

      const ask = sinon.stub();

      testServer.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      expect(ask.calledWithExactly(testClient, 'test body', sinon.match.func)).to.equal(true);
    });

    it('provides a callback with an ask event', () => {
      const ask = sinon.stub();

      testServer.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[2]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[2]();

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', undefined);
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with a body', () => {
      const ask = sinon.stub();

      testServer.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[2]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[2](undefined, 'test reply');

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', 'test reply');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with an error object', () => {
      const ask = sinon.stub();

      testServer.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[2]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[2](undefined, 'test reply');

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('body', 'test reply');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

    it('handles a reply to an ask with an error string', () => {
      const ask = sinon.stub();

      testServer.on('test ask', ask);

      parserStub.emit('message', {
        kind: 'ask',
        id: 'ask-id',
        function: 'test ask',
        body: 'test body',
      });

      const lastAsk = ask.lastCall.args;

      expect(lastAsk[2]).to.be.a('function');

      sansaStub.build.returns('test-ask-built');

      lastAsk[2](new Error('test error'));

      const lastBuild = sansaStub.build.firstCall.args[0];

      expect(lastBuild).to.have.property('err', 'Error: test error');
      expect(lastBuild).to.have.property('kind', 'reply');
      expect(lastBuild).to.have.property('id', 'ask-id');

      expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
    });

  });

  describe('client objects', () => {
    let serverConnected, connected, testClient;

    beforeEach(() => {
      serverConnected = netStub.createServer.args[0][0];
      connected = sinon.stub();
      testServer.on('connected', connected);
      testClient = fakeNewClient();
      serverConnected(testClient);
    });

    describe('events', () => {

      it('emit a client error on parser errors', () => {
        const clientError = sinon.stub();
        const fakeError = new Error('fake error');
        testClient.on('client error', clientError);
        parserStub.emit('error', fakeError);
        expect(clientError.calledWithExactly(fakeError),
          'clientError.calledWithExactly').to.equal(true);
      });

      it('emits on tell messages', () => {
        const tell = sinon.stub();
        testClient.on('test tell', tell);

        parserStub.emit('message', {
          kind: 'tell',
          function: 'test tell',
          body: 'test body',
        });

        expect(tell.calledWithExactly('test body'), 'tell.calledWithExactly').to.equal(true);
      });

      it('emits on ask messages', () => {

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

        expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
      });

      it('handles a reply to an ask with a body', () => {
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

        expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
      });

      it('handles a reply to an ask with an error object', () => {
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

        expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
      });

      it('handles a reply to an ask with an error string', () => {
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

        expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
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
        expect(testClient.write.calledWithExactly('test-tell-built')).to.equal(true);
      });

      it('sends ask messages', () => {
        sansaStub.build.returns('test-ask-built');

        testClient.ask('test ask', 'test body', () => {});

        const lastBuild = sansaStub.build.firstCall.args[0];

        expect(lastBuild).to.have.property('body', 'test body');
        expect(lastBuild).to.have.property('function', 'test ask');
        expect(lastBuild).to.have.property('kind', 'ask');
        expect(lastBuild).to.have.property('id');

        expect(testClient.write.calledWithExactly('test-ask-built')).to.equal(true);
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

      it('throws an error if you try and ask a reserved event name', () => {
        expect(() => {
          testClient.ask('on', {}, () => {});
        }).to.throw('ask(on) is a reserved event name');
      });

      it('throws an error if you try and tell a reserved event name', () => {
        expect(() => {
          testClient.tell('on', {});
        }).to.throw('tell(on) is a reserved event name');
      });

      it('throws an error if you try and send a message after the close event fires', () => {
        testClient.emit('close');
        expect(() => {
          testClient.tell('test event', {});
        }).to.throw('tell(test event) on client that has disconnected');
      });

      it('throws an error if you try and ask if the the close event has fired', () => {
        testClient.emit('close');
        expect(() => {
          testClient.ask('test event', {}, () => {});
        }).to.throw('ask(test event) on client that has disconnected');
      });

    });

  });

});
