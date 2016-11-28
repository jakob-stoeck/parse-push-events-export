// Export Parse Push Events
// log into http://parse.com and run this code in your web console
// the pushes will be inside window.pushes

// get pushes
// persist in db
// show in grid


const parseApp = 'push-tests--2'; // the string in the URL https://parse.com/apps/[PARSE_APP]/ e.g. 'push-tests--2'
const entries = 10;
const mockInternet = true;

const http = require('http');
const https = require('https');
const DOMParser = require('dom-parser');
const hostname = '127.0.0.1';
const port = 8080;

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Parse Push Export');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}`);
});

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(`parse-push-events-${parseApp}`);

const createTable = 'create table if not exists pushes (id varchar(10) primary key, channels varchar(255), content text, time varchar(20), sent int)';
const persistPush = 'insert into pushes (id, channels, content, time, sent) values ($id, $channels, $content, $time, $sent)';

db.serialize(() => {
  db.run(createTable);
});

function get(theUrl) {
  return new Promise(
    (resolve, reject) => {
      let xmlHttp = new XMLHttpRequest();
      xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
          resolve(xmlHttp.responseText);
      }
      xmlHttp.open('GET', theUrl, true);
      xmlHttp.send(null);
    }
  );
}

function getPushesByPage(appName, pageNo) {
  if (mockInternet) {
    return new Promise((resolve, reject) => {
      var tmpPushes = [{
        id: +(new Date()),
        channels: 'channel1channel2',
        content: 'content',
        time: new Date().toISOString()
      }];
      resolve(tmpPushes);
    });
  } else {
    return https.get(`https://parse.com/apps/${appName}/push_notifications?page=${pageNo}&type=all`, html => _parsePushes(parser.parseFromString(html, 'text/html')));
  }
}

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
function _parsePushes(doc) {
  return Array.prototype.slice.call(doc.querySelectorAll('#push_table tr[data-href]')).map(tr => ({
    id: tr.querySelector('.pushes_sent').id.replace('pushes_sent_', ''),
    channels: tr.querySelector('.push_target .tip').textContent.trim(),
    content: tr.querySelector('.push_name').textContent.trim(),
    time: tr.querySelector('.push_time').textContent.trim(),
    sent: null
  }));
}

function _getSentByPushes(pushes) {
  return new Promise(
    (resolve, reject) => {
      let query = encodeURI(pushes.map((p) => `pushes[${p.id}]=${p.time.replace('Z', '+00:00')}`).join('&'));
      let url = `https://parse.com/apps/${appName}/push_notifications/pushes_sent_batch?${query}`;
      console.info('gettingPushes', url);
      get(url).then(json => resolve(JSON.parse(json)));
    }
  );
}

function getPushes(appName, pageNo) {
  return new Promise((resolve, reject) => {
    let parser = new DOMParser();
    let pages = [];
    for (let i = 1; i <= pageNo; i++) {
      let page = new Promise((resolve, reject) => {
        console.info(`get page ${i}`);
        getPushesByPage(appName, i).then(tmpPushes => resolve(tmpPushes));
        // add sent amount to pushes
        // _getSentByPushes(tmpPushes).then(sentPushes => {
        //   let newPushes = tmpPushes.map(p => Object.assign(p, {sent: sentPushes[p.id]}));
        //   resolve(newPushes);
        // });
      });
      pages.push(page);
    }
    Promise.all(pages).then(values => {
      resolve([].concat.apply([], values));
    });
  });
}

getPushes(parseApp, Math.ceil(entries / 10)).then(result => {
  let stmt = db.prepare(persistPush);
  result.forEach(push => {
    console.log('inserting', result);
    stmt.run({
      $id: push.id,
      $name: push.name,
      $channels: push.channels,
      $time: push.time,
      $sent: push.sent
    });
  })
  stmt.finalize();

  db.each('select id, channels, content, time, sent from pushes', (err, row) => {
    console.log('row', row);
  });
});