import { logError } from '../helpers/logger.helper';

const multerFileUploadErrorHandler = (cb) => (req, res, next) => {
  cb(req, res, (err) => {
    if (err) {
      logError('multer error', err);
      return res.error(err);
    }

    return next();
  });
};

export default multerFileUploadErrorHandler;
