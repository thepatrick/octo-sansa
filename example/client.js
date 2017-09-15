const createClient = require('../lib/client');

const client = createClient(3813, 'localhost');

client.handle('dance', async ({ name }) => {
  return `Dance ${name}, dance!`;  
});

client.on('connect', async () => {
  const serverSaid = await client.ask('server dance', 'Bobby');
  console.log('Server said', serverSaid);
});
