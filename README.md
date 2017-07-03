# octo-sansa

[![CI Status](http://img.shields.io/travis/thepatrick/octo-sansa.svg?style=flat)](https://travis-ci.org/thepatrick/octo-sansa)
[![Version](https://img.shields.io/npm/v/octo-sansa.svg?style=flat)](http://npmjs.org/package/octo-sansa)
[![License](https://img.shields.io/github/license/thepatrick/octo-sansa.svg)](http://github.org/thepatrick/octo-sansa)

A very simple TCP (client/server) messaging layer

Getting started
---------------

A simple "echo" server:

```javascript

const octo = require('octo-sansa');

const server = octo.createServer();

server.on('connected', client => {
  client.on('echo', (body, callback) => {
    console.log('Client said', body);
    callback(undefined, body);
  });
});

server.listen(1234, () => {
  console.log('Server listening on ' + server.address().port);
});

```

A simple "echo" client:

```javascript

const octo = require('octo-sansa');

const client = octo.createClient(1234, 'localhost');

client.on('connect', () => {
  client.ask('echo', 'Say hello server', (err, response) => {
    console.log('The server said', response);
    client.close();
  });
});

```

TODO
----

Documentation of the API.
