import jwt from 'jsonwebtoken';
import { logError } from './logger.helper';
import RedisClient from './redis';
import { getUserRole } from './curation.rbac.helper';
import { ROLE_SUPER_CURATOR } from './rbac.roles';

export const verifyUser = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      throw new Error('Unauthorized User');
    }

    const token = header.split(' ')[1];

    if (!token) {
      throw new Error('Unauthorized User');
    }

    const result = jwt.verify(token, process.env.JWT_SECRET);

    req.user = result;
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res
        .status(403)
        .json({ success: false, message: 'Token expired error' });
    }

    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const verifyNormalUser = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      throw new Error('Unauthorized User');
    }

    const token = header.split(' ')[1];

    if (!token) {
      throw new Error('Unauthorized User');
    }

    const result = jwt.verify(token, process.env.JWT_SECRET);

    if (result.accessLevel !== 2) {
      if ((result.isMFAEnabled && result.mfaVerified) || !result.isMFAEnabled) {
        req.user = result;
        const userId = result.rootUserId ? result.rootUserId : result.sub;
        const sessionKey = `sess_${userId}_${result.sessionId}`;

        if (!(await RedisClient.exists(sessionKey))) {
          return res
            .status(401)
            .json({ success: false, message: 'Unauthorized User' });
        }

        return next();
      }

      throw new Error('MFA is not verified');
    }

    throw new Error('guest user not allowed');
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res
        .status(403)
        .json({ success: false, message: 'Token expired error' });
    }

    logError(`API has error ${req.originalUrl} by user`, e);
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const verifyUserOrGuestUser = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      throw new Error('Unauthorized User');
    }

    const token = header.split(' ')[1];

    if (!token) {
      throw new Error('Unauthorized User');
    }

    const result = jwt.verify(token, process.env.JWT_SECRET);

    req.user = result;
    return next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') {
      return res
        .status(403)
        .json({ success: false, message: 'Token expired error' });
    }

    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const checkUser = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      req.accessLevel = 2; // 2 for guest, 1 for normal user
      next();
    }

    const token = header.split(' ')[1];

    if (!token) {
      req.accessLevel = 2;
      next();
    }

    const result = jwt.verify(token, process.env.JWT_SECRET);

    req.user = result;
    req.token = token;
    req.isValidToken = true;
    req.accessLevel = result.accessLevel ? result.accessLevel : 1;
    next();
  } catch (e) {
    req.accessLevel = 2;
    next();
    // return res
    //   .status(401)
    //   .json({ success: false, message: "Unauthorized User" });
  }
};

export const verifyAdmin = (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header) {
      throw new Error('Unauthorized User');
    }

    const token = header.split(' ')[1];

    if (!token) {
      throw new Error('Unauthorized User');
    }

    const result = jwt.verify(token, process.env.JWT_SECRET);
    const apiKey = req.headers['x-api-key'];

    if (apiKey !== process.env.adminkey) {
      throw new Error('Invalid API Key');
    }

    req.user = result;
    return next();
  } catch (e) {
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const isCurator = async (req, res, next) => {
  try {
    const requester = req.user;
    const userRole = await getUserRole(requester.sub);

    if (userRole !== 0) {
      return next();
    }

    throw new Error('Unauthorized User');
  } catch (err) {
    logError(err.message, err);
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const isSuperCurator = async (req, res, next) => {
  try {
    const userRole = await getUserRole(req.user.sub);

    if (userRole === ROLE_SUPER_CURATOR) {
      return next();
    }

    throw new Error('Unauthorized User');
  } catch (err) {
    logError(err.message, err);
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};
