import AWS from 'aws-sdk';
import validate from 'deep-email-validator';
import { logError, logInfo } from '../helpers/logger.helper';

AWS.config.update({
  apiVersion: '2019-09-27',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_DEFAULT_REGION,
});

const sesv2 = new AWS.SESV2();

export const checkEmailInSuppressedList = async (email) => {
  try {
    const params = { EmailAddress: email };
    const result = await sesv2.getSuppressedDestination(params).promise();

    return result;
  } catch (err) {
    logError('Error in checkEmailInSuppressedList', err);

    // if email does not exist in the suppression list
    if (err.statusCode === 404) {
      return false;
    }

    throw err;
  }
};

export const validateEmail = async (email) => {
  try {
    const [suppressedListData, result] = await Promise.all([
      checkEmailInSuppressedList(email),
      validate(email),
    ]);

    if (suppressedListData || !result?.valid) {
      logInfo('Invalid email address');
      return false;
    }

    logInfo('Email verified');
    return true;
  } catch (err) {
    logError('validateEmail error', err);
    throw err;
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    logInfo('verifyEmail', req.body);

    const { email } = req.body;
    const isValidEmail = await validateEmail(email);

    if (!isValidEmail) {
      return res.badRequest('Invalid email address.');
    }

    return next();
  } catch (err) {
    logError(`API has error ${req.originalUrl} by user`, err);
    return res.error(err);
  }
};
