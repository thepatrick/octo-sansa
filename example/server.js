'use strict';

const createServer = require('../lib/server');

const server = createServer();

server.on('connected', client => {

  client.on('server dance', (body, callback) => {
    conole.log('Dance', body);
    client.ask('client dance', body, (err, response) => {
      console.log('Client said', response);
    });
  });

});

server.listen(3813);