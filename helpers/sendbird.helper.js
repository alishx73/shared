import axios from 'axios';
import https from 'https';
import { Users } from '../database/db-models';
import { logError, logInfo } from './logger.helper';

const { SENDBIRD_API_TOKEN, SENDBIRD_APP_ID } = process.env;

const sbBaseUrl = `https://api-${SENDBIRD_APP_ID}.sendbird.com`;
const groupChannelRoute = `${sbBaseUrl}/v3/group_channels`;
// const openChannelRoute = `${sbBaseUrl}/v3/open_channels`;
const userRoute = `${sbBaseUrl}/v3/users`;
const deactivatedUserName = 'Torum User';

const axiosRequest = axios.create({
  headers: {
    'Api-Token': SENDBIRD_API_TOKEN,
    'Content-Type': 'application/json',
  },
  httpsAgent: new https.Agent({ keepAlive: true }),
});

const createSbUser = (user) => axiosRequest.post(userRoute, user);
const listSbChannel = (parameter = '') =>
  axiosRequest.get(`${groupChannelRoute}?${parameter}`);
const updateChannelMetaData = (channelUrl, metadata) =>
  axiosRequest.put(`${groupChannelRoute}/${channelUrl}/metadata`, metadata);

export const setChannelPrefrence = async (userId) => {
  try {
    const updatedPrefrence = await axiosRequest.put(
      `${userRoute}/${userId}/channel_invitation_preference`,
      {
        auto_accept: false,
      },
    );

    return updatedPrefrence;
  } catch (err) {
    logError(
      `error occured on setting user channel prefrence for user ${userId} on sendbird`,
      err.message,
    );
    return err;
  }
};

export const updateSbUserMetadata = async (userId, payload) => {
  try {
    const updatedMetadata = await axiosRequest.put(
      `${userRoute}/${userId}/metadata`,
      payload,
    );

    return updatedMetadata;
  } catch (err) {
    logError(
      'error occured on updating sendbird users metadata on user update',
      err.message,
    );
    return err;
  }
};

export const updateSbUser = async (userId, payload) => {
  try {
    const updatedMetadata = await axiosRequest.put(
      `${userRoute}/${userId}`,
      payload,
    );

    return updatedMetadata;
  } catch (err) {
    logError(
      'error occured on updating sendbird users details on user update',
      err.message,
    );
    return err;
  }
};

export const blockSBUser = (userId, targetId) => {
  const route = `${userRoute}/${userId}/block`;

  return axiosRequest.post(route, { target_id: targetId });
};

export const unblockSBUser = (userId, targetId) => {
  const route = `${userRoute}/${userId}/block/${targetId}`;

  return axiosRequest.delete(route, {});
};

export async function updateChannelMetadata(userId, targetId, block) {
  const query = `members_include_in=${userId},${targetId}`;
  const foundChannel = await listSbChannel(query);
  const { channels } = foundChannel.data;

  if (channels.length > 0) {
    const channelId = channels[0].channel_url;
    const metadata = {
      metadata: { blockedOnTorum: block },
      upsert: true,
    };

    return updateChannelMetaData(channelId, metadata);
  }

  logInfo('channel not found for these users', { userId, targetId });

  return 0;
}

export const rejectSBGroupChat = (channelUrl, userId) => {
  const route = `${groupChannelRoute}/${channelUrl}/decline`;

  return axiosRequest.put(route, { user_id: userId });
};

export const deleteSBGroupChat = (channelUrl) => {
  const route = `${groupChannelRoute}/${channelUrl}`;

  return axiosRequest.delete(route, {});
};

export const createSendBirdUser = async (id) => {
  try {
    const user = await Users.findOne({ _id: id });

    if (!user) {
      throw new Error('user not found');
    }

    const sbUser = {
      issue_access_token: true,
      metadata: {
        name: user.name,
      },
    };

    sbUser.user_id = user._id;
    sbUser.nickname = user.username;
    sbUser.profile_url =
      user.profile_pic && user.profile_pic.p100 ? user.profile_pic.p100 : '';

    const sbSavedUser = await createSbUser(sbUser);

    await setChannelPrefrence(user._id);

    user.sb_access_token = sbSavedUser.data.access_token;
    await user.save();
    return user.sb_access_token;
  } catch (err) {
    logError(
      'error occured on creating sendbird user on user registration',
      err.message,
    );
    return '';
  }
};

export const searchSBChannelUser = (channelType, channelUrl, parameters) => {
  let query = '';

  // eslint-disable-next-line
  for (const parameter in parameters) {
    // eslint-disable-next-line
    if (parameters.hasOwnProperty(parameter)) {
      query += `${parameter}=${parameters[parameter]}&`;
    }
  }

  return axiosRequest.get(
    `${groupChannelRoute}/${channelUrl}/members?${query}`,
  );
};

export const deactivateSBUser = async (userId) => {
  await updateSbUser(userId, {
    nickname: deactivatedUserName,
    profile_url: '',
  });
  await updateSbUserMetadata(userId, {
    metadata: {
      name: deactivatedUserName,
      deactivated: 'true',
    },
    upsert: true,
  });
};

export const activateSBUser = async (userId) => {
  const user = await Users.findOne({ _id: userId });

  if (!user) {
    throw new Error('user not found');
  }

  await updateSbUser(userId, {
    nickname: user.username,
    profile_url: user.profile_pic.p100,
  });
  await updateSbUserMetadata(userId, {
    metadata: {
      name: user.name,
      deactivated: 'false',
    },
    upsert: true,
  });
};

export const hardDeleteSBUser = (userId) => {
  const route = `${userRoute}/${userId}`;

  return axiosRequest.delete(route, {});
};
