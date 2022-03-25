import genUUID from './genUUID';
import fs from 'fs';
import os from 'os';
import ps from 'ps-node';

function getFileNames(uuid) {
  return {
    pidFile: `${os.tmpdir()}/node-async-${uuid}.pid`,
    resFile: `${os.tmpdir()}/node-async-${uuid}.res`,
    errFile: `${os.tmpdir()}/node-async-${uuid}.err`,
  };
}

const unlinkFile = (path) =>
  new Promise((resolve) => {
    fs.unlink(path, () => resolve());
  });

const getStatsFile = (path) =>
  new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      }
      resolve(stats);
    });
  });

const readFile = (path) =>
  new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data.toString());
    });
  });

export const clearResult = async (uuid) => {
  const { pidFile, resFile, errFile } = getFileNames(uuid);
  unlinkFile(pidFile);
  unlinkFile(resFile);
  unlinkFile(errFile);
};

// Выполнение функции
export const run = async (fn, needClear = true) => {
  if (typeof fn !== 'function') {
    throw new Error('First parameter must be function');
  }
  if (typeof needClear !== 'boolean') {
    throw new Error('Second parameter must be boolean');
  }

  const uuid = genUUID();
  const { pidFile, resFile, errFile } = getFileNames(uuid);

  // Сохраним PID процесса, чтобы если процесс помрёт и следов не оставит
  // можно было это отследить
  await new Promise((resolve, reject) => {
    fs.writeFile(pidFile, `${process.pid};${needClear}`, { mode: 0o600 }, (err) => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });

  // Выполним функцию
  async function executeFn() {
    // Только для теста, когда процесс внезапно сдох, а следов не оставил.
    if (process && process.env && process.env.TEST_IS_DEAD) {
      return;
    }
    const data = await fn(uuid); // Передадим в fn сгенеренный uuid, может пригодиться
    let response = '';
    if (typeof data !== 'undefined') {
      response = data;
    }
    // Сохраним результат выполнения
    await new Promise((resolve, reject) => {
      fs.writeFile(resFile, response, { mode: 0o600 }, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }
  executeFn().catch(ex => {
    // Сохраним любой exception, чтобы потом можно было разобраться почему отвалились
    const err = ex && ex.result ? `HttpError: ${ex.result}` : ex;
    fs.writeFile(errFile, err, { mode: 0o600 }, (err) => {
      if (err) {
        throw err;
      }
    });
  });

  return uuid;
};

// Проверка результата
export const checkResult = async (uuid) => {
  if (typeof uuid !== 'string' || !uuid.length) {
    throw new Error('UUID must be not empty string');
  }

  const { pidFile, resFile, errFile } = getFileNames(uuid);

  // Поищем файл pid (мог удалиться по разным причинам, в том числе и из-за needClear)
  const statsPidFile = await getStatsFile(pidFile);

  // Если найден файл, то достанем его содержимое
  let pid;
  let needClear;
  if (statsPidFile && statsPidFile.isFile()) {
    const result = await readFile(pidFile);
    [pid, needClear] = result.split(';');
  } else {
    throw new Error(`PID file ${pidFile} isn't found`);
  }

  // Поищем файл результата
  const statsResFile = await getStatsFile(resFile);

  // Если найден файл результата, то вернём его содержимое
  if (statsResFile && statsResFile.isFile()) {
    const data = await readFile(resFile);
    // Если был передан флаг needClear, то подчистим за собой
    if (needClear === 'true') {
      setTimeout(() => clearResult(uuid), 1);
    }
    return {
      status: 'complete',
      data,
    };
  }

  // Поищем файл ошибок
  const statsErrFile = await getStatsFile(errFile);

  // Если найден файл ошибки, то вернём его содержимое
  if (statsErrFile && statsErrFile.isFile()) {
    const message = await readFile(errFile);
    if (needClear === 'true') {
      setTimeout(() => clearResult(uuid), 1);
    }
    return {
      status: 'error',
      message,
    };
  }

  // Если не найден ни файл ошибок ни файл результата поищем процесс по PID-у
  const process = await new Promise((resolve, reject) => {
    ps.lookup({ command: 'node', pid, psargs: 'x' }, (err, resultList) => {
      if (err) {
        reject(new Error(err));
      }
      resolve(resultList);
    });
  });

  // Если процесс найден и он всё ещё активен, значит пока ещё функция выполняется
  if (process.length && process[0] && process[0].command.indexOf('node') !== -1) {
    return {
      status: 'launched',
    };
  }
  // Процесс не найден
  return {
    status: 'error',
    message: 'process is dead',
  };
};
