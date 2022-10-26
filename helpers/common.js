import { Parser } from 'json2csv';
import sanitizeHtml from 'sanitize-html';

import { logError, logInfo } from './logger.helper';

const beginFloat = '~begin~float~';
const endFloat = '~end~float~';

/**
 * dateFormat (new Date (), "%Y-%m-%d %H:%M:%S", true);
 * returns "2012-05-18 05:37:21"
 */
export const dateFormat = (date, fstr, utc) => {
  utc = utc ? 'getUTC' : 'get';
  return fstr.replace(/%[YmdHMS]/g, (m) => {
    switch (m) {
      case '%Y':
        return date[`${utc}FullYear`](); // no leading zeros required

      case '%m':
        m = 1 + date[`${utc}Month`]();
        break;

      case '%d':
        m = date[`${utc}Date`]();
        break;

      case '%H':
        m = date[`${utc}Hours`]();
        break;

      case '%M':
        m = date[`${utc}Minutes`]();
        break;

      case '%S':
        m = date[`${utc}Seconds`]();
        break;

      default:
        return m.slice(1); // unknown code, remove %
    }
    // add leading zero if required
    return `0${m}`.slice(-2);
  });
};
export const strcasecmp = (fString1, fString2) => {
  const string1 = `${fString1}`.toLowerCase();
  const string2 = `${fString2}`.toLowerCase();

  if (string1 > string2) {
    return 1;
  }

  if (string1 === string2) {
    return 0;
  }

  return -1;
};

export const StringifyWithFloats =
  (config = {}) =>
  (inputValue, inputReplacer, space) => {
    const inputReplacerIsFunction = typeof inputReplacer === 'function';
    let isFirstIteration = true;
    const jsonReplacer = (key, val) => {
      if (isFirstIteration) {
        isFirstIteration = false;
        return inputReplacerIsFunction ? inputReplacer(key, val) : val;
      }

      let value;

      if (inputReplacerIsFunction) {
        value = inputReplacer(key, val);
      } else if (Array.isArray(inputReplacer)) {
        // remove the property if it is not included in the inputReplacer array
        value = inputReplacer.indexOf(key) !== -1 ? val : undefined;
      } else {
        value = val;
      }

      const forceFloat =
        config[key] === 'float' &&
        (value || value === 0) &&
        typeof value === 'number' &&
        !value.toString().toLowerCase().includes('e');

      return forceFloat ? `${beginFloat}${value}${endFloat}` : value;
    };
    const json = JSON.stringify(inputValue, jsonReplacer, space);
    const regexReplacer = (match, num) =>
      num.includes('.') || Number.isNaN(num) ? num : `${num}.0`;
    const re = new RegExp(`'${beginFloat}(.+?)${endFloat}'`, 'g');

    return json.replace(re, regexReplacer);
  };

export const downloadResource = (res, fileName, fields, data) => {
  const json2csv = new Parser({ fields });
  const csv = json2csv.parse(data);

  res.header('Content-Type', 'text/csv');
  res.attachment(fileName);
  return res.send(csv);
};

export const htmlSanitizer = (req, res, next) => {
  try {
    logInfo('htmlSanitizer has access');
    if (req.method !== 'GET') {
      const keys = Object.keys(req.body);

      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];

        // to do pass only value having html tag
        if (typeof req.body[key] === 'string') {
          req.body[key] = sanitizeHtml(req.body[key]);
        }
      }
    }

    logInfo('end htmlSanitizer has access');
    return next();
  } catch (e) {
    logError('htmlSanitizer has some error', e);
    return res.error({ message: 'something went wrong' });
  }
};

export const upsert = (array, element, propertyToCompare = '_id') => {
  const i = array.findIndex(
    (_element) => _element[propertyToCompare] === element[propertyToCompare],
  );

  if (i > -1) array[i] = element;
  else array.push(element);

  return array;
};
