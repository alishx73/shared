import { logError, logInfo } from './logger.helper';

const Redis = require('ioredis');
const bluebird = require('bluebird');

bluebird.promisifyAll(Redis);
// const client = redis.createClient();
const client = new Redis({
  port: 6379, // Redis port
  host: process.env.REDISHOST, // Redis host
  family: 4, // 4 (IPv4) or 6 (IPv6)
  password: process.env.REDISPASSWORD,
  db: 0,
  enableAutoPipelining: true,
});

// Print redis errors to the console
client.on('error', (err) => {
  logError(`Redis Error ${err}`);
});
client.on('connect', () => {
  logInfo('You are now connected to redis');
});
class RedisClient {
  async connect() {
    try {
      client.on('error', (err) => {
        logError(`Redis connection Error ${err}`);
      });
      client.on('connect', () => {
        logInfo('You are now connected to redis');
      });
    } catch (e) {
      logError(`Redis connection Error ${e}`);
    }
  }

  async set(key, data, time = null) {
    if (time) {
      time *= 60; // time in min and converting it into second
      await client.set(key, data, 'EX', time);
    } else {
      await client.set(key, data);
    }
  }

  async get(key) {
    const record = await client.get(key);

    return record;
  }

  async delete(key) {
    client.del(key).then(() => {});
  }

  async getSetValue(key, value) {
    try {
      const result = await client.sismember(key, value);

      return result;
    } catch (e) {
      logError('get getSetValue has error', e);
      return false;
    }
  }

  async getAllSetValue(key) {
    try {
      const result = await client.smembers(key);

      return result;
    } catch (e) {
      logError('get getSetValue has error', e);
      return false;
    }
  }

  async addSetValue(key, value, time) {
    try {
      if (value && value.length === 0) {
        value.push('5efebe977a106477170c9734'); // adding dummy value if not
      }

      const result = await client.sadd(key, value);

      if (time) {
        time *= 60; // time in min to milliseconds
        await client.expire(key, time);
      }

      return result;
    } catch (e) {
      logError('addSetValue has error', e);
      return false;
    }
  }

  async addSetValueSingle(key, value, time) {
    try {
      if (value && value.length === 0) {
        value.push('5efebe977a106477170c9734'); // adding dummy value if not
      }

      const isPresent = await client.smembers(key);

      if (!isPresent) {
        return false;
      }

      const result = await client.sadd(key, value);

      if (time) {
        time *= 60000; // time in min to milliseconds
        await client.expire(key, time);
      }

      return result;
    } catch (e) {
      logError('addSetValueAll has error', e);
      return false;
    }
  }

  async removeSetValue(key, value) {
    try {
      const result = await client.srem(key, value);

      return result;
    } catch (e) {
      logError('get getSetValue has error', e);
      return false;
    }
  }

  async exists(key) {
    try {
      const result = await client.exists(key);

      return result;
    } catch (e) {
      logError('get getSetValue has error', e);
      return false;
    }
  }
}
export default new RedisClient();
