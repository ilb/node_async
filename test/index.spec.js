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

test('Test signature', () => {
  expect(executeAsync(run)).toThrowError('First parameter must be function');
  expect(executeAsync(run.bind(run, 'Hello world'))).toThrowError('First parameter must be function');
  expect(executeAsync(run.bind(run, () => {}, 'Hello world'))).toThrowError('Second parameter must be boolean');

  expect(executeAsync(checkResult)).toThrowError('UUID must be not empty string');
  expect(executeAsync(checkResult.bind(run, ''))).toThrowError('UUID must be not empty string');
  expect(executeAsync(checkResult.bind(run, 123))).toThrowError('UUID must be not empty string');
});

test('Test execute run', async () => {
  const uuid = await executeAsync(run.bind(run, () => {}));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);
});

test('Test exception', async () => {
  const fn = () => {
    throw new Error('Test')
  }
  const uuid = await executeAsync(run.bind(run, fn));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"error","message":"Error: Test"}');
});

test('Test synchronous code', async () => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"complete","data":"Hello world"}');
});

test('Test asynchronous code', async () => {
  const fn = async () =>
    await new Promise(resolve => {
      setTimeout(() => resolve('Hello world'), 100);
    });
  const uuid = await executeAsync(run.bind(run, fn));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"launched"}');
  expect(await new Promise(resolve => {
    setTimeout(async () => {
      resolve(JSON.stringify(await checkResult(uuid)));
    }, 150);
  })).toBe('{"status":"complete","data":"Hello world"}');
});

test('Test process is dead', async () => {
  const uuid = await new Promise((resolve, reject) => {
    const exec = require('child_process').exec;
    exec('TEST_IS_DEAD=true node ./runEmptyFn', (err, stdout, stderr) => {
      if (err) {
        reject(err.toString());
      }
      resolve(stdout.toString().trim());
    });
  });

  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"error","message":"process is dead"}');
});

test('Test auto clear result files', async () => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  expect(Boolean(statsPidFile)).toBe(false);

  const statsResFile = await getStatsFile(resFile);
  expect(Boolean(statsResFile)).toBe(false);


  const fn1 = () => {
    throw new Error('Test')
  }
  const uuid1 = await executeAsync(run.bind(run, fn1));
  expect(typeof uuid1).toBe('string');
  expect(uuid1.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid1))).toBe('{"status":"error","message":"Error: Test"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile: pidFile1, errFile: errFile1, resFile: resFile1 } = getFileNames(uuid1);
  const statsPidFile1 = await getStatsFile(pidFile1);
  expect(Boolean(statsPidFile1)).toBe(false);

  const statsErrFile1 = await getStatsFile(errFile1);
  expect(Boolean(statsErrFile1)).toBe(false);
});

test('Test not auto clear result files', async () => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn, false));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  expect(Boolean(statsPidFile) && statsPidFile.isFile()).toBe(true);

  const statsErrFile = await getStatsFile(errFile);
  expect(Boolean(statsErrFile) && statsErrFile.isFile()).toBe(false);

  const statsResFile = await getStatsFile(resFile);
  expect(Boolean(statsResFile) && statsResFile.isFile()).toBe(true);


  const fn1 = () => {
    throw new Error('Test')
  }
  const uuid1 = await executeAsync(run.bind(run, fn1, false));
  expect(typeof uuid1).toBe('string');
  expect(uuid1.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid1))).toBe('{"status":"error","message":"Error: Test"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile: pidFile1, errFile: errFile1, resFile: resFile1 } = getFileNames(uuid1);
  const statsPidFile1 = await getStatsFile(pidFile1);
  expect(Boolean(statsPidFile1) && statsPidFile1.isFile()).toBe(true);

  const statsErrFile1 = await getStatsFile(errFile1);
  expect(Boolean(statsErrFile1) && statsErrFile1.isFile()).toBe(true);

  const statsResFile1 = await getStatsFile(resFile1);
  expect(Boolean(statsResFile1) && statsResFile1.isFile()).toBe(false);
});


test('Test manual clear result files', async () => {
  const fn = () => {
    return 'Hello world'
  }
  const uuid = await executeAsync(run.bind(run, fn, false));
  expect(typeof uuid).toBe('string');
  expect(uuid.length).toBe(36);

  expect(JSON.stringify(await checkResult(uuid))).toBe('{"status":"complete","data":"Hello world"}');

  await new Promise(resolve => setTimeout(() => resolve(), 1));
  const { pidFile, errFile, resFile } = getFileNames(uuid);
  const statsPidFile = await getStatsFile(pidFile);
  expect(Boolean(statsPidFile) && statsPidFile.isFile()).toBe(true);

  const statsErrFile = await getStatsFile(errFile);
  expect(Boolean(statsErrFile) && statsErrFile.isFile()).toBe(false);

  const statsResFile = await getStatsFile(resFile);
  expect(Boolean(statsResFile) && statsResFile.isFile()).toBe(true);

  clearResult(uuid);

  const statsPidFile1 = await getStatsFile(pidFile);
  expect(Boolean(statsPidFile1) && statsPidFile1.isFile()).toBe(false);

  const statsResFile1 = await getStatsFile(resFile);
  expect(Boolean(statsResFile1) && statsResFile1.isFile()).toBe(false);
});
