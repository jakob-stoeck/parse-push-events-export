const http = require('http');
const https = require('https');
const jsdom = require('jsdom');
const ParseExporter = require('./server');
const expect = require('chai').expect;

describe('Parse Exporter works', function() {
  it('parses pushes', function(done) {
    const testPush = {
      id: 'OqnWec9FLV',
      channels: 'game-8240425event-startendGame',
      content: '{\n  \"body\": \"Spielende Olympique Lyon gegen Paris Saint-Germain. 1:2\",\n  \"title\": \"SPORT1\"\n}',
      time: '2016-11-27T21:41:23Z',
      sent: -1
    };
    jsdom.env('./fixtures/parse-pushes.html', (err, window) => {
      let pushes = ParseExporter.parsePushes(window.document);
      expect(pushes.length).to.equal(11);
      expect(pushes[0]).to.eql(testPush);
      done();
    });
  });
});