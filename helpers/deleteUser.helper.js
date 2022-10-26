import { Types } from 'mongoose';
import axios from 'axios';
import {
  ClanMembers,
  Clans,
  CommentLikes,
  Comments,
  Connections,
  LoginInformation,
  NewsItems,
  NewsLikes,
  Notifications,
  PostLikes,
  Posts,
  // PostTransaction,
  PublicAddress,
  Replies,
  ReplyLikes,
  SavedNews,
  SharePost,
  UserGiftSummaries,
  Users,
  Votes,
  Wallets,
} from '../database/db-models';
import {
  // COMMENT_TRANSACTION,
  DATA_ACTIVE,
  DATA_REMOVED,
  LIKED,
  // POST_TRANSACTION,
} from '../database/db-models/enum';
import {
  transactionEmail,
  updateSendiblueContact,
} from '../services/sendiblue.service';
import { logError, logInfo } from './logger.helper';
import { deactivateSBUser } from './sendbird.helper';
import RedisClient from './redis';

const DeviceDetector = require('node-device-detector');

const detector = new DeviceDetector({
  clientIndexes: true,
  deviceIndexes: true,
  deviceAliasCode: false,
});

const reducePostCommentCount = async (uid) => {
  const commentList = await Comments.find(
    { uid, is_active: false, isBanned: true },
    { _id: 0, postid: 1, newsId: 1 },
  );
  const bulkOpsArrPost = [];
  const bulkOpsArrNews = [];

  commentList.forEach((post) => {
    const { postid, newsId } = post;

    if (postid) {
      const filter = { _id: postid };
      const update = {
        $inc: { comment_count: -1 },
      };

      bulkOpsArrPost.push({
        updateOne: {
          filter,
          update,
        },
      });
    } else {
      const filter = { _id: newsId };
      const update = {
        $inc: { commentCount: -1 },
      };

      bulkOpsArrNews.push({
        updateOne: {
          filter,
          update,
        },
      });
    }
  });
  const bulkUpdateResultPost = await Posts.bulkWrite(bulkOpsArrPost);
  const bulkUpdateResultNews = await NewsItems.bulkWrite(bulkOpsArrPost);

  logInfo(
    'reducePostCommentCount bulk update',
    bulkUpdateResultPost,
    bulkUpdateResultNews,
  );
};
const sharePostDataDelete = async (uid) => {
  try {
    await SharePost.updateMany(
      { uid, status: DATA_ACTIVE },
      { $set: { status: DATA_REMOVED } },
    );
    const sharePostList = await SharePost.find({ uid, status: DATA_REMOVED });
    const rePostedPostList = [];
    const spreadPostList = [];

    sharePostList.forEach((sharePost) => {
      if (sharePost.remark === 'spread') {
        spreadPostList.push(sharePost.postid);
      } else {
        rePostedPostList.push(sharePost.postid);
      }
    });
    if (spreadPostList.length > 0) {
      Posts.updateMany(
        { _id: { $in: spreadPostList } },
        { $inc: { spread_count: -1 }, $pull: { spreadPostBy: uid } },
      )
        .then((re) => {
          logInfo('spreadPostList count', re);
        })
        .catch((e) => {
          logError('spreadPostList count', e);
        });
    }

    if (rePostedPostList.length > 0) {
      const bulkOpsArrPost = [];

      rePostedPostList.forEach((postId) => {
        const filter = { _id: postId };
        const update = {
          $inc: { share_count: -1 },
          $pull: { rePostBy: uid },
        };

        bulkOpsArrPost.push({
          updateOne: {
            filter,
            update,
          },
        });
      });
      await Posts.bulkWrite(bulkOpsArrPost);
    }

    return true;
  } catch (e) {
    logError('Share post delete has error', e.stack);
    return false;
  }
};

const postLikeDataDelete = async (uid) => {
  try {
    logInfo('postLikeDataDelete called');
    await PostLikes.updateMany(
      { uid, status: true },
      { $set: { status: false, isBanned: true } },
    );

    const postLikeList = await PostLikes.find(
      { uid, isBanned: true },
      { postid: 1, _id: 0 },
    ).lean();
    const postLikeListId = postLikeList.map((post) => post.postid);

    await Posts.updateMany(
      { _id: { $in: postLikeListId } },
      { $inc: { like_count: -1 }, $pull: { likePostBy: uid } },
    );
    return true;
  } catch (e) {
    logError('postLikeDataDelete has error', e.stack);
    return false;
  }
};

const postVoteDataDelete = async (uid) => {
  try {
    logInfo('postLikeDataDelete called');
    await Votes.updateMany(
      { uid, is_active: true },
      { $set: { is_active: false, is_deleted: true, isBanned: true } },
    );

    const voteList = await Votes.find(
      { uid, isBanned: true },
      { postid: 1, _id: 0, poll: 1, level: 1 },
    );

    const bulkOpsArr = voteList.map((post) => {
      const { poll, postid, level } = post;
      const filter = { _id: postid };
      const p = `poll.${level}.${poll}`;
      const update = {
        $inc: { [p]: -1 },
        $pull: { votedBy: { userId: uid, option: poll } },
      };

      return {
        updateOne: {
          filter,
          update,
        },
      };
    });

    logInfo('bulkOpsArr bulkOpsArr', bulkOpsArr);
    const bulkUpdateResult = await Posts.bulkWrite(bulkOpsArr);

    logInfo('postVoteDataDelete bulk update', bulkUpdateResult);
    return true;
  } catch (e) {
    logError('postVoteDataDelete has error', e.stack);
    return false;
  }
};

const commentLikeDataDelete = async (uid) => {
  try {
    logInfo('commentLikeDataDelete called');
    await CommentLikes.updateMany(
      { uid, isLike: true },
      { $set: { isLike: false, isBanned: true } },
    );

    const commentLikeList = await CommentLikes.find(
      { uid, isBanned: true },
      { commentid: 1, _id: 0 },
    ).lean();
    const commentLikeListId = commentLikeList.map(
      (comment) => comment.commentid,
    );

    await Comments.updateMany(
      { _id: { $in: commentLikeListId } },
      { $inc: { like_count: -1 }, $pull: { likeCommentBy: uid } },
    );
    return true;
  } catch (e) {
    logError('commentLikeDataDelete has error', e.stack);
    return false;
  }
};
// score manage over news and post - require -- not doing
// gift management show lander has given the gift -- done
// show balance before delete - frontend
// vote should show -- not doing
// company delete if he is owner

const reduceCommentReplyCount = async (uid) => {
  const replyList = await Replies.find(
    { uid, is_active: false, isBanned: true },
    { _id: 0, commentid: 1 },
  );
  const bulkOpsArrPost = [];

  replyList.forEach((reply) => {
    const { commentid } = reply;

    const filter = { _id: commentid };
    const update = {
      $inc: { reply_count: -1 },
    };

    bulkOpsArrPost.push({
      updateOne: {
        filter,
        update,
      },
    });
  });
  const bulkUpdateResult = await Comments.bulkWrite(bulkOpsArrPost);

  logInfo('reduceCommentReplyCount bulk update', bulkUpdateResult);
};

const postDelete = async (uid) => {
  //   delete post
  Posts.updateMany(
    { uid, is_active: true },
    { $set: { is_active: false, is_deleted: true, isBanned: true } },
  ).then(async (p) => {
    const pList = await Posts.find(
      {
        uid,
        is_active: false,
        isBanned: true,
        newsId: { $exists: true },
      },
      { newsId: 1, _id: 0 },
    ).lean();

    if (pList.length > 0) {
      const pId = pList.map((pp) => pp.newsId);

      // score need manage
      await NewsItems.updateMany(
        { _id: { $in: pId } },
        { $inc: { postCount: -1 } },
      );
    }

    logInfo('delete all post for user', p);
  });

  // savePostBy
  //   SavedPosts

  // spreadPostBy & repost
  sharePostDataDelete(uid)
    .then((p) => {
      logInfo('sharePostDataDelete done', p);
    })
    .catch((e) => {
      logError('sharePostDataDelete ', e);
    });
  // likePostBy
  postLikeDataDelete(uid)
    .then((p) => {
      logInfo('postLikeDataDelete done', p);
    })
    .catch((e) => {
      logError('postLikeDataDelete ', e);
    });

  // votedBy
  postVoteDataDelete(uid)
    .then((p) => {
      logInfo('postLikeDataDelete done', p);
    })
    .catch((e) => {
      logError('postLikeDataDelete ', e);
    });
  // supportedBy
  // support
  // receiver will get XTM but it will not show on the post

  // postSupportDataDelete(uid)
  //   .then((p) => {
  //     logInfo('postSupportDataDelete done', p);
  //   })
  //   .catch((e) => {
  //     logError('postSupportDataDelete ', e);
  //   });
};

const commentDelete = async (uid) => {
  Comments.updateMany(
    { uid, is_active: true },
    { $set: { is_active: false, is_deleted: true, isBanned: true } },
  ).then((p) => {
    reducePostCommentCount(uid)
      .then((re) => {
        logInfo('reducePostCommentCount done', re);
      })
      .catch((e) => {
        logError('reducePostCommentCount ', e);
      });
    logInfo('delete all comment for user', p);
  });

  commentLikeDataDelete(uid).then((p) => {
    logInfo('commentLikeDataDelete done', p);
  });

  // commentSupportDataDelete(uid).then((p) => {
  //   logInfo('commentSupportDataDelete done', p);
  // });
};

const replyLikeDataDelete = async (uid) => {
  try {
    logInfo('commentLikeDataDelete called');
    await ReplyLikes.updateMany(
      { uid, isLike: true },
      { $set: { isLike: false, isBanned: true } },
    );

    const replyLikeList = await ReplyLikes.find(
      { uid, isBanned: true },
      { replyid: 1, _id: 0 },
    ).lean();
    const replyLikeListId = replyLikeList.map((reply) => reply.replyid);

    await Replies.updateMany(
      { _id: { $in: replyLikeListId } },
      { $inc: { like_count: -1 }, $pull: { likeReplyBy: uid } },
    );
    return true;
  } catch (e) {
    logError('commentLikeDataDelete has error', e.stack);
    return false;
  }
};

const replyDelete = async (uid) => {
  Replies.updateMany(
    { uid, is_active: true },
    { $set: { is_active: false, is_deleted: true, isBanned: true } },
  ).then((p) => {
    reduceCommentReplyCount(uid).then((re) => {
      logInfo('reduceCommentReplyCount done', re);
    });
    logInfo('delete all reply for user', p);
  });
  replyLikeDataDelete(uid)
    .then((postResult) => {
      logInfo('replyLikeDataDelete data', postResult);
    })
    .catch((e) => {
      logError('Error in replyLikeDataDelete data', e);
    });

  // reply support
};

const connectionManagement = async (uid) => {
  // to do add flag in connections
  //   reduce count for the user which this user follow
  await Connections.updateMany(
    { uid, status: DATA_ACTIVE },
    { $set: { status: DATA_REMOVED } },
  );
  Connections.find({ uid, status: DATA_REMOVED }, { follow: 1 }).then(
    (result) => {
      const followUserId = result.map((res) => res.follow);

      Users.updateMany(
        { _id: { $in: followUserId } },
        { $inc: { followers_count: -1 } },
      ).then((p) => {
        logInfo('Reduce the follower count', p);
      });
    },
  );

  await Connections.updateMany(
    { follow: uid, status: DATA_ACTIVE },
    { $set: { status: DATA_REMOVED } },
  );
  //   reduce count for the user which follow this user
  Connections.find({ follow: uid, status: DATA_REMOVED }, { uid: 1 }).then(
    (result) => {
      const followingUserId = result.map((res) => res.uid);

      Users.updateMany(
        { _id: { $in: followingUserId } },
        { $inc: { following_count: -1 } },
      ).then((p) => {
        logInfo('Reduce the following count', p);
      });
    },
  );
};
// try {

// } catch (e) {
//   logError('notificationManagement has error', e.stack);
//   throw Error(e);
// }

const newsLikeDataDelete = async (uid) => {
  try {
    logInfo('newsLikeDataDelete called');
    await NewsLikes.updateMany(
      { uid, status: LIKED },
      { $set: { status: DATA_REMOVED } },
    );

    const newsLikeList = await NewsLikes.find(
      { uid, status: DATA_REMOVED },
      { newsId: 1, _id: 0 },
    ).lean();
    const newsLikeListId = newsLikeList.map((news) => news.newsId);

    NewsItems.updateMany(
      { _id: { $in: newsLikeListId } },
      { $inc: { likeCount: -1 }, $pull: { likedBy: uid } },
    );
    return true;
  } catch (e) {
    logError('newsLikeDataDelete has error', e.stack);
    return false;
  }
};

const newsSaveDataDelete = async (uid) => {
  try {
    logInfo('newsLikeDataDelete called');
    await SavedNews.updateMany(
      { uid, status: DATA_ACTIVE },
      { $set: { status: DATA_REMOVED } },
    );

    const newsLikeList = await SavedNews.find(
      { uid, status: DATA_REMOVED },
      { news: 1, _id: 0 },
    ).lean();
    const newsLikeListId = newsLikeList.map((news) => news.news);

    await NewsItems.updateMany(
      { _id: { $in: newsLikeListId } },
      { $pull: { savedBy: uid } },
    );
    return true;
  } catch (e) {
    logError('newsLikeDataDelete has error', e.stack);
    return false;
  }
};
const newsManagement = async (uid) => {
  try {
    // likeCount
    newsLikeDataDelete(uid)
      .then((likeData) => {
        logInfo('newsLikeDataDelete', likeData);
      })
      .catch((er) => {
        logError('error in newsLikeDataDelete', er);
      });

    // postCount done in post delete
    // commentCount done in comment delete
    // repostCount && rePostedBy -- need to ask
    // subscribers -- need to ask
    // savedBy
    newsSaveDataDelete(uid)
      .then((saveData) => {
        logInfo('newsSaveDataDelete', saveData);
      })
      .catch((er) => {
        logError('error in newsSaveDataDelete', er);
      });
  } catch (e) {
    logError('newsManagement has error', e.stack);
    throw Error(e);
  }
};
const notificationManagement = async (uid) => {
  try {
    Notifications.updateMany(
      { uid, isActive: true },
      { $set: { isActive: false, isBanned: true } },
      { timestamps: false },
    )
      .then((res) => {
        logInfo('notification deleted', res);
      })
      .catch((e) => {
        logError('notification delete has error', e);
      });

    Notifications.updateMany(
      { actorid: uid, actorIdArr: { $size: 1 }, isActive: true },
      { $set: { isActive: false, isBanned: true } },
      { timestamps: false },
    )
      .then((res) => {
        logInfo('notification deleted', res);
      })
      .catch((e) => {
        logError('notification delete has error', e);
      });
    return true;
    // Todo notification generated due to this user
  } catch (e) {
    logError('notificationManagement has error', e.stack);
    throw Error(e);
  }
};

const clanManagement = async (uid) => {
  try {
    // finding member of which clan
    const clanList = await ClanMembers.find(
      { memberid: uid, status: DATA_ACTIVE },
      { _id: 0, clanid: 1 },
    ).lean();
    const clanListId = clanList.map((clan) => clan.clanid);

    // reduce clan member count
    await Clans.updateMany(
      { _id: { $in: clanListId } },
      { $inc: { members_count: -1 } },
    );
    // finding own clan
    const clans = await Clans.find({ uid }, { _id: 1 }).lean();

    if (clans.length > 0) {
      const clansId = clans.map((clan) => clan._id);

      // setting status to be removed for member he own the clan and for which he is member
      await ClanMembers.updateMany(
        {
          $or: [
            { memberid: uid, status: DATA_ACTIVE },
            { clanid: { $in: clansId } },
          ],
        },
        { $set: { status: DATA_REMOVED } },
      );
      // *****need to work at clanMember queries
      await Clans.updateMany(
        { _id: { $in: clansId } },
        { $set: { isBanned: true, is_active: false, is_deleted: true } },
      );
    } else {
      await ClanMembers.updateMany(
        { memberid: uid, status: DATA_ACTIVE },
        { $set: { status: DATA_REMOVED } },
      );
    }

    return true;
  } catch (e) {
    logError('notificationManagement has error', e.stack);
    throw Error(e);
  }
};

const sendEmail = async (req, userInfo, isDelete) => {
  try {
    const ua = req.headers['user-agent'];
    // get user browser
    const deviceDetails = detector.detect(ua);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const api = `https://pro.ip-api.com/json/${ip}?key=T8B6RXsXdo1vSX4 `;
    const geoIpData = await axios.get(api);
    const locationDetails = geoIpData.data;
    const currentDate = new Date();
    const data = {
      action: isDelete
        ? 'attempt_to_delete_account'
        : 'attempt_to_deactivate_account',
      email: userInfo.email,
      meta: {
        USERNAME: userInfo.username,
        ACCOUNT_ACTIVITY_TIME: `${currentDate.getHours()}:${currentDate.getMinutes()}`,
        ACCOUNT_ACTIVITY_DATE: `${currentDate.getDate()}/${
          currentDate.getMonth() + 1
        }/${currentDate.getFullYear()}`,
        ACCOUNT_ACTIVITY_BROWSER: deviceDetails?.client?.name,
        ACCOUNT_ACTIVITY_IP: ip,
        ACCOUNT_ACTIVITY_LOCATION: locationDetails?.city || 'Unknown Location',
      },
    };

    await transactionEmail(data);
    return true;
  } catch (e) {
    logError('sendEmail has error in delete account', e);
    return false;
  }
};

const sessionManagement = async (uid) => {
  try {
    logInfo('sessionManagement called', uid);
    const loginInformation = await LoginInformation.find({
      userId: uid,
      isActive: true,
    });

    loginInformation.forEach((session) => {
      const key = `refreshToken_${uid}_${session.sessionId}`;
      const sessionKey = `sess_${uid}_${session.sessionId}`;

      RedisClient.delete(sessionKey)
        .then((deletedSession) => {
          logInfo(`Redis delete key ${deletedSession} by ${sessionKey}`);
        })
        .catch((error) => {
          logError(`Unable to delete session key:${error}`);
        });

      RedisClient.delete(key)
        .then((deletedSession) => {
          logInfo(`Redis delete key ${deletedSession} by ${key}`);
        })
        .catch((error) => {
          logError(`Unable to delete session key:${error}`);
        });
    });

    await LoginInformation.updateMany(
      {
        userId: uid,
        isActive: true,
      },
      { $set: { isActive: false } },
    );
    return true;
  } catch (e) {
    logError('sessionManagement has error', e);
    return false;
  }
};

export const softDeleteUserHandler = async (req, userInfo, isDelete) => {
  const uid = Types.ObjectId(userInfo._id);

  if (req) {
    sendEmail(req, userInfo, isDelete).then((result) => {
      logInfo('send email result', result);
    });
  }

  postDelete(uid)
    .then((postResult) => {
      logInfo('delete post related data', postResult);
    })
    .catch((e) => {
      logError('Error in delete post data', e);
    });

  //   delete comment

  commentDelete(uid)
    .then((commentResult) => {
      logInfo('delete comment related data', commentResult);
    })
    .catch((e) => {
      logError('Error in delete comment data', e);
    });
  //   delete reply

  replyDelete(uid)
    .then((result) => {
      logInfo('delete reply related data', result);
    })
    .catch((e) => {
      logError('Error in delete reply data', e);
    });

  // connection management
  connectionManagement(uid)
    .then((result) => {
      logInfo('delete reply related data', result);
    })
    .catch((e) => {
      logError('Error in delete reply data', e);
    });

  //   notification management
  notificationManagement(uid)
    .then((result) => {
      logInfo('delete notification related data', result);
    })
    .catch((e) => {
      logError('Error in delete notification data', e);
    });

  //   remove from clan management
  clanManagement(uid)
    .then((result) => {
      logInfo('delete clan related data', result);
    })
    .catch((e) => {
      logError('Error in delete clan data', e);
    });

  if (req) {
    //   sendinblue
    updateSendiblueContact({
      emailSubscription: false,
      email: userInfo.email,
    })
      .then((data) => {
        logInfo('BlackList status updated:', data);
      })
      .catch((err) => {
        logError('Error in updating blacklist status:', err);
      });
    // eslint-disable-next-line no-use-before-define
    companyManage(uid)
      .then((result) => {
        logInfo('companyManage result', result);
      })
      .catch((err) => {
        logError('companyManage has error', err);
      });

    //   public_addresses
    PublicAddress.updateMany(
      { userId: uid, status: DATA_ACTIVE },
      { $set: { status: DATA_REMOVED } },
    )
      .then((res) => {
        logInfo('public address update', res);
      })
      .catch((e) => {
        logError('public address has error', e);
      });
  }

  //   remove from news management
  newsManagement(uid)
    .then((result) => {
      logInfo('delete news related data', result);
    })
    .catch((e) => {
      logError('Error in delete news data', e);
    });
  // message management
  deactivateSBUser(uid)
    .then((messageResult) => {
      logInfo('deactivateSBUser result', messageResult);
    })
    .catch((err) => {
      logError('deactivateSBUser has error', err);
    });

  UserGiftSummaries.updateMany({ uid }, { $set: { status: DATA_REMOVED } })
    .then((result) => {
      logInfo('user gift summary result', result);
    })
    .catch((err) => {
      logError('user gift summary has error', err);
    });
  Wallets.findOneAndUpdate({ uid }, { $set: { status: DATA_REMOVED } })
    .then((result) => {
      logInfo('wallet result', result);
    })
    .catch((err) => {
      logError('wallet has error', err);
    });

  sessionManagement(uid)
    .then((result) => {
      logInfo('sessionManagement result', result);
    })
    .catch((err) => {
      logError('sessionManagement error', err);
    });
  //   avatar??
  //   lounge??
  //
  //   portfolio??
  //   more data from s3 bucket

  //   modulus manual delete - after 30 days
};

const companyManage = async (userId) => {
  try {
    logInfo('company manage', userId);
    const company = await Users.findOneAndUpdate(
      {
        uid: userId,
        type: 'company',
        is_active: true,
        isSuspended: false,
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deleteReason: 'company',
          is_active: false,
          is_deleted: true,
        },
      },
    );

    if (!company) {
      return true;
    }

    softDeleteUserHandler(null, company, null)
      .then((result) => {
        logInfo('soft delete company result', result);
      })
      .catch((er) => {
        logError('soft delete has error', er);
      });
    return true;
  } catch (e) {
    logError('company manage has issue', e);
    return false;
  }
};

export const test = 't';

// const commentSupportDataDelete = async (uid) => {
//   try {
//     logInfo('commentSupportDataDelete called');
//     await PostTransaction.updateMany(
//       { senderid: uid, status: DATA_ACTIVE, type: COMMENT_TRANSACTION },
//       { $set: { status: DATA_REMOVED } },
//     );

//     const commentTransactionList = await PostTransaction.find(
//       { senderid: uid, status: DATA_REMOVED, type: COMMENT_TRANSACTION },
//       { commentid: 1 },
//     ).lean();

//     const bulkOpsArr = commentTransactionList.map((comment) => {
//       const { commentid, gift_name: giftName } = comment;
//       const filter = { _id: commentid };
//       const update = {
//         $inc: { support: { [giftName]: -1 } },
//         $pull: { supportedBy: { userId: uid } },
//       };

//       return {
//         updateOne: {
//           filter,
//           update,
//         },
//       };
//     });
//     const bulkUpdateResult = await Comments.bulkWrite(bulkOpsArr);

//     logInfo('commentSupportDataDelete bulk update', bulkUpdateResult);
//     return true;
//   } catch (e) {
//     logError('commentSupportDataDelete has error', e.stack);
//     return false;
//   }
// };

// not doing
// const postSupportDataDelete = async (uid) => {
//   try {
//     logInfo('postSupportDataDelete called');
//     await PostTransaction.updateMany(
//       { senderid: uid, status: DATA_ACTIVE, type: POST_TRANSACTION },
//       { $set: { status: DATA_REMOVED } },
//     );

//     const postTransactionList = await PostTransaction.find(
//       { senderid: uid, status: DATA_REMOVED, type: POST_TRANSACTION },
//       { postid: 1 },
//     ).lean();

//     const bulkOpsArr = postTransactionList.forEach((post) => {
//       const { postid, gift_name: giftName } = post;
//       const filter = { _id: postid };
//       const update = {
//         $inc: { support: { [giftName]: -1 } },
//         $pull: { supportedBy: { userId: uid } },
//       };

//       return {
//         updateOne: {
//           filter,
//           update,
//         },
//       };
//     });
//     const bulkUpdateResult = await Posts.bulkWrite(bulkOpsArr);

//     logInfo('postSupportDataDelete bulk update', bulkUpdateResult);
//     return true;
//   } catch (e) {
//     logError('postSupportDataDelete has error', e.stack);
//     return false;
//   }
// };
