import { Connections } from '../database/db-models';
import { logError } from './logger.helper';

const updateOldFollowers = async (uId) => {
  try {
    await Connections.updateMany(
      {
        uid: uId,
        isNewFollow: true,
      },
      {
        $set: {
          isNewFollow: false,
        },
      },
    );

    return true;
  } catch (error) {
    return logError('Error while update old followers', error);
  }
};

// eslint-disable-next-line
export { updateOldFollowers };
