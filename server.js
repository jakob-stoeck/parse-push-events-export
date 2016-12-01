// Export Parse Push Events
// log into http://parse.com and run this code in your web console
// the pushes will be inside window.pushes

// get pushes
// persist in db
// show in grid

const parseApp = '[INSERT]'; // the string in the URL https://parse.com/apps/[PARSE_APP]/ e.g. 'push-tests--2'
const pageFrom = 1;
const pageTo = 1;
const mockInternet = true;

const assert = require('assert');
const http = require('http');
const https = require('https');
const jsdom = require('jsdom');

const hostname = '127.0.0.1';
const port = 8080;

const cookie = '_parse_session=[REDACTED]; domain=.parse.com; path=/; expires=Thu, 29-Dec-2016 12:17:23 GMT; secure; HttpOnly';

// const server = http.createServer((req, res) => {
//   res.statusCode = 200;
//   res.setHeader('Content-Type', 'text/plain');
//   res.end('Parse Push Export');
// });

// server.listen(port, hostname, () => {
//   console.log(`Server running at http://${hostname}:${port}`);
// });

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(`db/${parseApp}.sqlite3`);

const ParseExporter = {
  /**
   * Parse HTML table into pushes like this:
   * var pushExample = {
   *  id: 'tFe0qqtBeK',
   *  channels: 'channel1channel2',
   *  content: 'content',
   *  time: '2016-11-24T21:55:30Z'
   * };
   * @param DOMdocument doc
   * @return Object[]
   */
  parsePushes: function(doc) {
    return Array.prototype.slice.call(doc.querySelectorAll('#push_table tr[data-href]')).map((tr, index) => ({
      id: tr.getAttribute('data-href').split('/').pop(),
      channels: tr.querySelector('.push_target .tip').textContent.trim(),
      content: tr.querySelector('.push_name').textContent.trim(),
      time: tr.querySelector('.push_time').textContent.trim(),
      sent: -1
    }));
  },

  getSentByPushes: function(pushes) {
    return new Promise((resolve, reject) => {
      const query = encodeURI(pushes.map((p) => `pushes[${p.id}]=${p.time.replace('Z', '+00:00')}`).join('&'));
      const options = {
        hostname: 'parse.com',
        port: 443,
        path: `/apps/${parseApp}/push_notifications/pushes_sent_batch?${query}`,
        method: 'GET',
        agent: false,
        headers: {
          'Cookie': cookie,
        }
      };
      https.get(options, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(body));
        });
      });
    });
  },

  getPushes: function(appName, pageNo) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'parse.com',
        port: 443,
        path: `/apps/${appName}/push_notifications?page=${pageNo}&type=all`,
        method: 'GET',
        agent: false,
        headers: {
          'Cookie': cookie,
        }
      };
      // jsdom bug fails to support cookie so we use https.request
      let req = https.request(options, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          jsdom.env({
            html: body,
            done: (err, window) => resolve(this.parsePushes(window.document))
          });
        })
      }).on('error', e => console.log(e));
      req.end();
    });
  }
};

module.exports = ParseExporter;

function persistPushes(pushes) {
  const persistPush = 'INSERT OR REPLACE INTO pushes (id, channels, content, time, sent) VALUES ($id, $channels, $content, $time, $sent)';
  let insertPush = db.prepare(persistPush);
  pushes.forEach(push => {
    insertPush.run({
      $id: push.id,
      $name: push.name,
      $channels: push.channels,
      $content: push.content,
      $time: push.time,
      $sent: push.sent
    });
  });
  return insertPush.finalize();
}

function persistPages(pageFrom, pageTo = pageFrom) {
  db.serialize(() => {
    const createTable = 'CREATE TABLE IF NOT EXISTS pushes (id varchar(10) primary key, channels varchar(255), content text, time varchar(20), sent int)';
    db.run(createTable);
    for (let pageNo = pageFrom; pageNo <= pageTo; pageNo++) {
      ParseExporter.getPushes(parseApp, pageNo).then(result => {
        console.log(`Page ${pageNo}: ${result.length} entries found. Persisting ...`);
        if (pageNo === pageTo) {
          console.log(`Earliest push: ${result.slice(-1)[0].time}`);
        }
        persistPushes(result);
      });
    }
    // db.each('SELECT id, channels from pushes', (err, row) => {
    //   console.log('row', row);
    // });
  });
}

function addSent() {
  let i = 0;
  const bucketSize = 20;
  db.all(`SELECT * from pushes where channels in ('highlight', 'breakingnews') and sent == -1`, (err, pushes) => {
    console.info(`${pushes.length} pushes found`);
    for (let j=0; j<Math.ceil(pushes.length/bucketSize); j++) {
      let bucket = pushes.slice(j*bucketSize, (j+1)*bucketSize-1);
      ParseExporter.getSentByPushes(bucket).then(sentPushes => {
        assert(sentPushes[bucket[0].id] !== undefined, 'sentPushes exists');
        assert(bucket.length >= 1, 'bucket exists');
        let newPushes = bucket.map(p => {
          assert(sentPushes[p['id'].toString()] !== undefined, `sent pushes info available ${p['id'].toString()} in ${JSON.stringify(p)} and ${JSON.stringify(sentPushes)}`);
          p.sent = sentPushes[p.id];
          return p;
        });
        assert(newPushes[0].sent > -1, 'Sent is saved');
        persistPushes(newPushes);
      });
    }
  });
}

// persistPages(501, 1000);
// addSent();

// db.each(`SELECT * from pushes where channels in ('highlight', 'breakingnews') and sent > 0 order by time desc`, (err, p) => {
//   console.log(`${p.time}, ${p.sent}, "${JSON.parse(p.content).body}"`);
// });
