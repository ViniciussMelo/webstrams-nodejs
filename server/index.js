import { Readable, Transform, Writable } from 'node:stream';
import { TransformStream } from 'node:stream/web';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import csvtojson from 'csvtojson';
import byteSize from 'byte-size';
import { setTimeout } from 'node:timers/promises';

const PORT = 3000;

createServer(async (request, response) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': '*',
  }

  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  let counter = 0;
  const filename = './data/animeflv.csv';
  const { size } = await stat(filename);

  console.log(`processing ${byteSize(size)}`);

  try {
    const abortController = new AbortController();

    response.writeHead(200, headers);
    request.once('close', _ => {
      console.log(`connection was closed after processing ${counter} items`);
      abortController.abort();
    });

    // convert nodejs stream to web stream
    // 1 - await until the data get available
    // 2 - convert to csvtojson
    // 3 - do some process
    // 4 - redirect the response
    await Readable.toWeb(createReadStream(filename))
      .pipeThrough(
        Transform.toWeb(csvtojson())
      )
      .pipeThrough(
        new TransformStream({
          async transform(jsonLine, controller) {
            const data = JSON.parse(Buffer.from(jsonLine));
            
            const mappedData = JSON.stringify({
              title: data.title,
              description: data.description,
              url: data.url_anime,
            })

            counter++;
            // we make sure that our data has a separator
            // in case, Node.js is controlling the flow
            // it can hold some string in memory and send them all
            // at once
            // ndjson
            // await setTimeout(200)
            controller.enqueue(mappedData.concat('\n'))
          }
        })
      )
      .pipeTo(
        Writable.toWeb(response),
        { signal: abortController.signal }
      );
  } catch (error) {
    if (error.message.includes('abort')) return;

    console.log('something happened: ', error);
  }
})
.listen(PORT)
.on('listening', _ => console.log(`server is running at port: ${PORT}`))