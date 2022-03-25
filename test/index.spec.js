import test from 'ava';
import { run, checkResult, clearResult } from '../lib';
import fs from 'fs';
import os from 'os';

const executeAsync = (fn) =>
  new Promise(
    async (resolve, reject) => {
      try {
        resolve(await fn());
      } catch(e) {
        reject(e);
      }
    }
  )

const getStatsFile = (path) =>
  new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      }
      resolve(stats);
    });
  });

function getFileNames(uuid) {
  return {
    pidFile: `${os.tmpdir()}/node-async-${uuid}.pid`,
    resFile: `${os.tmpdir()}/node-async-${uuid}.res`,
    errFile: `${os.tmpdir()}/node-async-${uuid}.err`,
  };
}

test('Test signature', t => {
  t.throws(executeAsync(run), 'First parameter must be function');
  t.throws(executeAsync(run.bind(run, 'Hello world')), 'First parameter must be function');
  t.throws(executeAsync(run.bind(run, () => {}, 'Hello world')), 'Second parameter must be boolean');

  t.throws(executeAsync(checkResult), 'UUID must be not empty string');
  t.throws(executeAsync(checkResult.bind(run, '')), 'UUID must be not empty string');
  t.throws(executeAsync(checkResult.bind(run, 123)), 'UUID must be not empty string');
});

test('Test execute run', async t => {
  const uuid = await executeAsync(run.bind(run, () => {}));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);
});

test('Test exception', async t => {
  const fn = () => {
    throw new Error('Test')
  }
  const uuid = await executeAsync(run.bind(run, fn));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"error","message":"Error: Test"}');
});

test('Test synchronous code', async t => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"complete","data":"Hello world"}');
});

test('Test asynchronous code', async t => {
  const fn = async () =>
    await new Promise(resolve => {
      setTimeout(() => resolve('Hello world'), 100);
    });
  const uuid = await executeAsync(run.bind(run, fn));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"launched"}');
  t.is(await new Promise(resolve => {
    setTimeout(async () => {
      resolve(JSON.stringify(await checkResult(uuid)));
    }, 150);
  }), '{"status":"complete","data":"Hello world"}');
});

test('Test process is dead', async t => {
  const uuid = await new Promise((resolve, reject) => {
    const exec = require('child_process').exec;
    exec('TEST_IS_DEAD=true node ./runEmptyFn', (err, stdout, stderr) => {
      if (err) {
        reject(err.toString());
      }
      resolve(stdout.toString().trim());
    });
  });

  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"error","message":"process is dead"}');
});

test('Test auto clear result files', async t => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  t.is(Boolean(statsPidFile), false);

  const statsResFile = await getStatsFile(resFile);
  t.is(Boolean(statsResFile), false);


  const fn1 = () => {
    throw new Error('Test')
  }
  const uuid1 = await executeAsync(run.bind(run, fn1));
  t.is(typeof uuid1, 'string');
  t.is(uuid1.length, 36);

  t.is(JSON.stringify(await checkResult(uuid1)), '{"status":"error","message":"Error: Test"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile: pidFile1, errFile: errFile1, resFile: resFile1 } = getFileNames(uuid1);
  const statsPidFile1 = await getStatsFile(pidFile1);
  t.is(Boolean(statsPidFile1), false);

  const statsErrFile1 = await getStatsFile(errFile1);
  t.is(Boolean(statsErrFile1), false);
});

test('Test not auto clear result files', async t => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn, false));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  t.is(Boolean(statsPidFile) && statsPidFile.isFile(), true);

  const statsErrFile = await getStatsFile(errFile);
  t.is(Boolean(statsErrFile) && statsErrFile.isFile(), false);

  const statsResFile = await getStatsFile(resFile);
  t.is(Boolean(statsResFile) && statsResFile.isFile(), true);


  const fn1 = () => {
    throw new Error('Test')
  }
  const uuid1 = await executeAsync(run.bind(run, fn1, false));
  t.is(typeof uuid1, 'string');
  t.is(uuid1.length, 36);

  t.is(JSON.stringify(await checkResult(uuid1)), '{"status":"error","message":"Error: Test"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile: pidFile1, errFile: errFile1, resFile: resFile1 } = getFileNames(uuid1);
  const statsPidFile1 = await getStatsFile(pidFile1);
  t.is(Boolean(statsPidFile1) && statsPidFile1.isFile(), true);

  const statsErrFile1 = await getStatsFile(errFile1);
  t.is(Boolean(statsErrFile1) && statsErrFile1.isFile(), true);

  const statsResFile1 = await getStatsFile(resFile1);
  t.is(Boolean(statsResFile1) && statsResFile1.isFile(), false);
});


test('Test manual clear result files', async t => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn, false));
  t.is(typeof uuid, 'string');
  t.is(uuid.length, 36);

  t.is(JSON.stringify(await checkResult(uuid)), '{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  t.is(Boolean(statsPidFile) && statsPidFile.isFile(), true);

  const statsErrFile = await getStatsFile(errFile);
  t.is(Boolean(statsErrFile) && statsErrFile.isFile(), false);

  const statsResFile = await getStatsFile(resFile);
  t.is(Boolean(statsResFile) && statsResFile.isFile(), true);

  clearResult(uuid);

  const statsPidFile1 = await getStatsFile(pidFile);
  t.is(Boolean(statsPidFile1) && statsPidFile1.isFile(), false);

  const statsResFile1 = await getStatsFile(resFile);
  t.is(Boolean(statsResFile1) && statsResFile1.isFile(), false);
});
