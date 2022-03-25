require("babel-register");
require("babel-polyfill");

var run = require('../lib').run;
run(() => {})
  .then(data => console.log(data))
  .catch(err => {
    throw err;
  });
