var Steps = require('cucumis').Steps,
    path = require('path'),
    fs = require('fs'),
    http = require('http'),
    assert  = require('assert'),
    stepsData = require('./steps_data').data;
    
var port = 8200,
    host = '127.0.0.1',
    server,
    serverName,
    linkTypes = {},
    client = http.createClient(port, host),
    headers = {},
    response;

Steps.Runner.on('beforeTest', function(done) {
	var linkTypesFile = 'features/step_definitions/link_types.json';
	if(path.exists(linkTypesFile, function(exists) {
	  if(exists)
  	  fs.readFile(linkTypesFile, 'utf8', function(err, data) {
  	      linkTypes = JSON.parse(data);
  	      done();
  	  });
  	else
  	  done();
	}));
});

Steps.Runner.on('afterTest', function(done) {
  if(server)
	  server.close();
	done();
});

Steps.Runner.on('beforeScenario', function(done) {
  headers = {};
  done();
});

Steps.Given(/^the (.+) server is running$/, function (ctx, name) {
  if(serverName !== name) {
    if(server)
      server.close();
    serverName = name;
    server = require('../../' + serverName + '-server.js').server;
    server.start(port, host);
  }
  ctx.done();
});

Steps.Given(/^I accept (.*)$/, function (ctx, mimeType) {
  headers.accept = mimeType;
	ctx.done();
});

Steps.When(/^I (GET|HEAD|OPTIONS) (\/.*)$/, function (ctx, method, path) {
  var request = client.request(method, path, headers);
  request.end();
  handleResponse(ctx, request);
});

Steps.When(/^I POST the file (.*) as (.*) to (\/.*)$/, function (ctx, file, name, path) {
  fs.stat(file, function(err, stat) {
    headers['Content-Type'] = 'multipart/form-data; boundary=1234';
    headers['Expect'] = '100-continue';
    var request = client.request('POST', path, headers);
    request.on('continue', function() {
      request.write('--1234\r\n'
                    + 'Content-Disposition: form-data; name="' + name
                    + '"; filename="' + file + '"\r\n'
                    + 'Content-Type: text/plain\r\n\r\n'
                    + 'contents\r\n\r\n'
                    + '--1234--\r\n');
      request.end();
      handleResponse(ctx, request);
    });
  });
});

function handleResponse(ctx, request) {
  request.on('response', function (resp) {
    var receivedLength = 0,
        responseLength = stepsData.responseLength = parseInt(resp.headers['content-length']),
        responseBodyBuffer = stepsData.responseBodyBuffer = new Buffer(responseLength);
    stepsData.response = response = resp;
    
    response.on('data', function(chunk) {
      chunk.copy(responseBodyBuffer, receivedLength, 0);
      receivedLength += chunk.length;
    });
    response.on('end', function() {
      stepsData.responseBody = !responseBodyBuffer.length ? ''
                                   : responseBodyBuffer.toString('utf8');
      ctx.done();
    })
  });
}

Steps.Then(/^it should have MIME type (.*)$/, function (ctx, mimeType) {
  response.headers.should.include.keys('content-type');
  response.headers['content-type'].replace(/;.*/, '').should.eql(mimeType);
	ctx.done();
});

Steps.Then(/^I should receive an? (.+) link to (\/.*)$/, function (ctx, linkName, path) {
  linkTypes.should.include.keys(linkName);
  var linkType = linkTypes[linkName];
  
  response.headers.should.include.keys('link');
  var linkHeader = response.headers['link'];
  
  var reLink = '(^|,)\\s*<' + RegExp.escape(path) + '>;\\s*rel="' + linkType.rel + '"'
                 + (linkType.title ? ';\\s*title="' + linkType.title + '"' : '')
                 + (linkType.type  ?';\\s*type="'   + linkType.type  + '"' : '') + '($|,)';
  
  linkHeader.should.match(new RegExp(reLink));
  ctx.done();
});

Steps.Then(/^the response status should be (\d+).*$/, function (ctx, code) {
  response.statusCode.should.eql(parseInt(code, 10));
	ctx.done();
});

Steps.Then(/^the response location should be (.*)$/, function (ctx, path) {
  response.headers.location.should.eql(path);
	ctx.done();
});

Steps.export(module);
