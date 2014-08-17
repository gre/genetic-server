#!/usr/bin/env node

var express = require("express");
var fs = require("fs");
var Q = require("q");
var _ = require("lodash");

var program = require("commander");
var pkg = require("./package.json");

//// Config ////

program
  .version(pkg.version)
  .description(pkg.description)
  .option("-c, --config <config>", "The configuration file", "config.json")
  .parse(process.argv);

var config = JSON.parse(fs.readFileSync(program.config));

if (!("id" in config)) throw new Error("config: need id");
if (!("server" in config)) config.server = 8020;
if (!("initialData" in config)) throw new Error("config: need initialData");
if (!("mutationRates" in config)) throw new Error("config: need mutationRates");
if (!("generationDuration" in config)) throw new Error("config: need generationDuration");

var dataFile = ".data-"+config.id+".json";


console.log("Config:", config);

//// Data ////

var _data = readData();
_data.then(function (dataRead) {
  var data = _.clone(dataRead);
  data.stable = _.extend({}, bootstrapData().stable, data.stable);
  data.current = _.extend({}, bootstrapData().current, data.current);
  data.generation = data.generation || 0;
  data.score = data.score || 0;
  if (!_.isEqual(data, dataRead))
    return storeData(data);
  else
    return data;
}).then(logData);

function bootstrapData () {
  return {
    stable: config.initialData,
    current: config.initialData,
    generation: 0,
    score: 0
  };
}
function readData () {
   return Q.nfcall(fs.readFile, dataFile, "utf8")
    .then(function (json) {
      return JSON.parse(json);
    })
    .fail(function () {
      return storeData(bootstrapData());
    });
}
function storeData (data) {
   return Q.nfcall(fs.writeFile, dataFile, JSON.stringify(data), "utf8")
     .thenResolve(data);
}

function logData (data) {
  console.log("Data: " + JSON.stringify(data));
}

//// AI ////

function learn (score) {
  _data = _data.then(function (data) {
    data = _.clone(data);
    data.generation ++;
    console.log("Learn score="+score+" generation="+data.generation);
    if (data.generation % config.generationDuration === 0) {
      if (score > data.score) {
        data.stable = data.current;
        data.score = score;
      }
      data.current = mutate(data.current);
    }
    logData(data);
    return storeData(data);
  });
  return _data;
}

function mutate (values) {
  return _.chain(_.keys(values))
   .shuffle()
   .zip(config.mutationRates)
   .map(function (array) {
     var key = array[0], rate = array[1]||0;
     if (!key) return null;
     var value = values[key];
     var mutation = rate * 2 * (Math.random()-0.5);
     var newValue = value + value * mutation;
     if (mutation)
       console.log("Mutation for "+key+" with mutation="+mutation+" : "+value+"->"+newValue);
     return [ key, newValue ];
   })
   .compact()
   .object()
   .value();
}

function getStable () {
  return _data.get("stable");
}

function getCurrent () {
  return _data.get("current");
}

//// SERVER ////

var app = express();
app.use(require("body-parser").urlencoded({ extended: false }));

app.get("/", function (req, res) {
  res.send("See README for usage.");
});

app.get("/stable", function (req, res) {
  getStable()
  .then(function (values) {
    res.send(JSON.stringify(values));
  })
  .fail(function (e) {
    console.log(e)
    console.log(e.stack);
    res.status(400).send(e.toString());
  })
  .done();
});

app.get("/current", function (req, res) {
  getCurrent()
  .then(function (values) {
    res.send(JSON.stringify(values));
  })
  .fail(function (e) {
    console.log(e)
    console.log(e.stack);
    res.status(400).send(e.toString());
  })
  .done();
});

app.post("/learn", function (req, res) {
  Q.fcall(function () {
    return parseFloat(req.body.score, 10);
  })
  .then(learn)
  .then(function (data) {
    res.send(JSON.stringify(data));
  })
  .fail(function (e) {
    console.log(e)
    console.log(e.stack);
    res.status(400).send(e.toString());
  })
  .done();
});

app.listen(config.server);
