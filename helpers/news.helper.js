import { Users } from '../database/db-models';

import { SUCCESS } from './constants';

export const addNotificationTag = async (uid, tags) => {
  // check if this user exists
  const user = await Users.findOne({ _id: uid }, { newsPreferences: 1 });

  if (!user) {
    return 'User does not exists';
  }

  await Users.updateOne(
    {
      _id: uid,
    },
    {
      $set: {
        'newsPreferences.notificationTags': tags,
      },
    },
  );
  return SUCCESS;
};

export const removeNotificationTag = async (uid, tags) => {
  // check if this user exists
  const user = await Users.findOne({ _id: uid }, { newsPreferences: 1 });

  if (!user) {
    return 'User does not exists';
  }

  const tagIds = tags.map((t) => t._id);

  // remove tags
  await Users.updateOne(
    {
      _id: uid,
    },
    {
      $pull: {
        'newsPreferences.notificationTags': { tagId: { $in: tagIds } },
      },
    },
  );

  return SUCCESS;
};

export const addDisabledTag = async (uid, tags) => {
  // check if this user exists
  const user = await Users.findOne({ _id: uid }, { newsPreferences: 1 });

  if (!user) {
    return 'User does not exists';
  }

  await Users.updateOne(
    {
      _id: uid,
    },
    {
      $set: {
        'newsPreferences.disabledTags': tags,
      },
    },
  );
  return SUCCESS;
};

export const removeDisabledTag = async (uid, tags) => {
  // check if this user exists
  const user = await Users.findOne({ _id: uid }, { newsPreferences: 1 });

  if (!user) {
    return 'User does not exists';
  }

  const tagIds = tags.map((t) => t._id);

  // remove tags
  await Users.updateOne(
    {
      _id: uid,
    },
    {
      $pull: {
        'newsPreferences.disabledTags': { tagId: { $in: tagIds } },
      },
    },
  );

  return SUCCESS;
};
