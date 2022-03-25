import { run, checkResult, clearResult } from '../src';
run(() => {})
  .then(data => console.log(data))
  .catch(err => {
    throw err;
  });
