import Redis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';

const redisClient = new Redis({
  port: 6379, // Redis port
  host: process.env.REDISHOST, // Redis host
  family: 4, // 4 (IPv4) or 6 (IPv6)
  password: process.env.REDISPASSWORD,
  db: 1,
  enableAutoPipelining: true,
});
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'user_middleware',
  points: 20, // 10 requests
  duration: 1, // per 1 second by IP
});

// to do per IP per user
// login api
export const rateLimiterMiddleware = (req, res, next) =>
  rateLimiter
    .consume(req.ip)
    .then(() => next())
    .catch(() => res.status(429).send('Too Many Requests'));

export const name = 'ddos';
