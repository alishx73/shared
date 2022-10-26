import axios from 'axios';
import { Types } from 'mongoose';
import {
  ClanMembers,
  Clans,
  CommentLikes,
  Comments,
  Connections,
  DeleteUserHistory,
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
import { activateSBUser } from './sendbird.helper';

const DeviceDetector = require('node-device-detector');

const detector = new DeviceDetector({
  clientIndexes: true,
  deviceIndexes: true,
  deviceAliasCode: false,
});

const reducePostCommentCount = async (uid) => {
  try {
    const commentList = await Comments.find(
      { uid, is_active: true },
      { _id: 0, postid: 1, newsId: true },
    ).lean();
    const bulkOpsArrPost = [];
    const bulkOpsArrNews = [];

    commentList.forEach((post) => {
      const { postid, newsId } = post;

      if (postid) {
        const filter = { _id: postid };
        const update = {
          $inc: { comment_count: 1 },
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
          $inc: { commentCount: 1 },
        };

        bulkOpsArrNews.push({
          updateOne: {
            filter,
            update,
          },
        });
      }
    });
    const [bulkUpdateResultPost, bulkUpdateResultNews] = await Promise.all([
      Posts.bulkWrite(bulkOpsArrPost),
      NewsItems.bulkWrite(bulkOpsArrPost),
    ]);

    logInfo(
      'reducePostCommentCount bulk update',
      bulkUpdateResultPost,
      bulkUpdateResultNews,
    );
    return true;
  } catch (e) {
    return false;
  }
};
const sharePostDataDelete = async (uid) => {
  try {
    await SharePost.updateMany(
      { uid, status: DATA_REMOVED },
      { $set: { status: DATA_ACTIVE } },
    );
    const sharePostList = await SharePost.find({ uid, status: DATA_ACTIVE });
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
      await Posts.updateMany(
        { _id: { $in: spreadPostList } },
        { $inc: { spread_count: 1 }, $push: { spreadPostBy: uid } },
      );
    }

    if (rePostedPostList.length > 0) {
      await Posts.updateMany(
        { _id: { $in: rePostedPostList } },
        { $inc: { share_count: 1 }, $push: { rePostBy: uid } },
      );
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
      { uid, status: false, isBanned: true },
      { $set: { status: true, isBanned: false } },
    );

    const postLikeList = await PostLikes.find(
      { uid, status: true },
      { postid: 1, _id: 0 },
    ).lean();
    const postLikeListId = postLikeList.map((post) => post.postid);

    await Posts.updateMany(
      { _id: { $in: postLikeListId } },
      { $inc: { like_count: 1 }, $push: { likePostBy: uid } },
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
      { uid, is_active: false, isBanned: true },
      { $set: { is_active: true, is_deleted: false, isBanned: false } },
    );

    const voteList = await Votes.find(
      { uid, is_active: true },
      { postid: 1, _id: 0, poll: 1 },
    ).lean();

    const bulkOpsArr = voteList.map((post) => {
      const { poll, postid } = post;
      const filter = { _id: postid };
      const update = {
        $inc: { poll: { [poll]: 1 } },
        $push: { votedBy: { userId: uid } },
      };

      return {
        updateOne: {
          filter,
          update,
        },
      };
    });
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
      { uid, isLike: false, isBanned: true },
      { $set: { isLike: true, isBanned: false } },
    );

    const commentLikeList = await CommentLikes.find(
      { uid, isLike: true },
      { commentid: 1, _id: 0 },
    ).lean();
    const commentLikeListId = commentLikeList.map(
      (comment) => comment.commentid,
    );

    await Comments.updateMany(
      { _id: { $in: commentLikeListId } },
      { $inc: { like_count: 1 }, $push: { likeCommentBy: uid } },
    );
    return true;
  } catch (e) {
    logError('commentLikeDataDelete has error', e.stack);
    return false;
  }
};

const reduceCommentReplyCount = async (uid) => {
  const replyList = await Replies.find(
    { uid, is_active: true },
    { _id: 0, commentid: 1 },
  ).lean();

  const commentIdArr = replyList.map((reply) => reply.commentid);
  const bulkUpdateResult = await Comments.updateMany(
    { _id: { $in: commentIdArr } },
    { $inc: { reply_count: 1 } },
  );

  logInfo('reduceCommentReplyCount bulk update', bulkUpdateResult);
};

const postDelete = async (uid) => {
  try {
    //   delete post
    Posts.updateMany(
      { uid, is_active: false, isBanned: true },
      { $set: { is_active: true, is_deleted: false, isBanned: false } },
    ).then(async (p) => {
      const pList = await Posts.find(
        {
          uid,
          is_active: true,
          newsId: { $exists: true },
        },
        { newsId: 1, _id: 0 },
      ).lean();

      if (pList.length > 0) {
        const pId = pList.map((pp) => pp.newsId);

        await NewsItems.updateMany(
          { _id: { $in: pId } },
          { $inc: { postCount: 1 } },
        );
      }

      logInfo('delete all post for user', p);
    });

    // savePostBy
    //   SavedPosts

    // spreadPostBy & repost
    await Promise.all([
      sharePostDataDelete(uid),
      postLikeDataDelete(uid),
      postVoteDataDelete(uid),
      // postSupportDataDelete(uid),
    ]);
    return true;
  } catch (e) {
    logError('delete post in revert data', e);
    return false;
  }
};

const commentDelete = async (uid) => {
  try {
    await Comments.updateMany(
      { uid, is_active: false, isBanned: true },
      { $set: { is_active: true, is_deleted: false, isBanned: false } },
    );
    await commentLikeDataDelete(uid);
    // await Promise.all([
    //   commentLikeDataDelete(uid),
    //   commentSupportDataDelete(uid),
    // ]);
    await reducePostCommentCount(uid);
    return true;
  } catch (e) {
    return false;
  }
};

const replyLikeDataDelete = async (uid) => {
  try {
    logInfo('replyLikeDataDelete called');
    await ReplyLikes.updateMany(
      { uid, isLike: false, isBanned: true },
      { $set: { isLike: true, isBanned: false } },
    );

    const replyLikeList = await ReplyLikes.find(
      { uid, isLike: true },
      { replyid: 1, _id: 0 },
    ).lean();
    const replyLikeListId = replyLikeList.map((reply) => reply.replyid);

    await Replies.updateMany(
      { _id: { $in: replyLikeListId } },
      { $inc: { like_count: 1 }, $push: { likeReplyBy: uid } },
    );
    return true;
  } catch (e) {
    logError('replyLikeDataDelete has error', e.stack);
    return false;
  }
};

const replyDelete = async (uid) => {
  try {
    await Promise.all([
      Replies.updateMany(
        { uid, is_active: false, isBanned: true },
        { $set: { is_active: true, is_deleted: false, isBanned: false } },
      ),
      replyLikeDataDelete(uid),
    ]);
    await reduceCommentReplyCount(uid);
    return true;
  } catch (e) {
    return false;
  }

  // reply support
};

const connectionManagement = async (uid) => {
  // to do add flag in connections
  //   reduce count for the user which this user follow
  await Connections.updateMany(
    { uid, status: DATA_REMOVED },
    { $set: { status: DATA_ACTIVE } },
  );
  Connections.find({ uid, status: DATA_ACTIVE }, { follow: 1 }).then(
    (result) => {
      const followUserId = result.map((res) => res.follow);

      Users.updateMany(
        { _id: { $in: followUserId } },
        { $inc: { followers_count: 1 } },
      ).then((p) => {
        logInfo('Reduce the follower count', p);
      });
    },
  );
  await Connections.updateMany(
    { follow: uid, status: DATA_REMOVED },
    { $set: { status: DATA_ACTIVE } },
  );
  //   reduce count for the user which follow this user
  Connections.find({ follow: uid, status: DATA_ACTIVE }, { uid: 1 }).then(
    (result) => {
      const followingUserId = result.map((res) => res.uid);

      Users.updateMany(
        { _id: { $in: followingUserId } },
        { $inc: { following_count: 1 } },
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
      { uid, status: DATA_REMOVED },
      { $set: { status: LIKED } },
    );

    const newsLikeList = await NewsLikes.find(
      { uid, status: LIKED },
      { newsId: 1, _id: 0 },
    ).lean();
    const newsLikeListId = newsLikeList.map((news) => news.newsId);

    await NewsItems.updateMany(
      { _id: { $in: newsLikeListId } },
      { $inc: { likeCount: 1 }, $push: { likedBy: uid } },
    );
    return true;
  } catch (e) {
    logError('newsLikeDataDelete has error', e.stack);
    return false;
  }
};

const newsSaveDataDelete = async (uid) => {
  try {
    logInfo('newsSaveDataDelete called');
    await SavedNews.updateMany(
      { uid, status: DATA_REMOVED },
      { $set: { status: DATA_ACTIVE } },
    );

    const newsLikeList = await SavedNews.find(
      { uid, status: DATA_ACTIVE },
      { news: 1, _id: 0 },
    ).lean();
    const newsLikeListId = newsLikeList.map((news) => news.news);

    await NewsItems.updateMany(
      { _id: { $in: newsLikeListId } },
      { $push: { savedBy: uid } },
    );
    return true;
  } catch (e) {
    logError('newsSaveDataDelete has error', e.stack);
    return false;
  }
};
const newsManagement = async (uid) => {
  try {
    // likeCount
    await Promise.all([newsLikeDataDelete(uid), newsSaveDataDelete(uid)]);

    // postCount done in post delete
    // commentCount done in comment delete
    // repostCount && rePostedBy -- need to ask
    // subscribers -- need to ask
    // savedBy
  } catch (e) {
    logError('newsManagement has error', e.stack);
    throw Error(e);
  }
};
const notificationManagement = async (uid) => {
  try {
    await Notifications.updateMany(
      { uid, isActive: true, isBanned: true },
      { $set: { isActive: true, isBanned: false } },
    );
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
      { memberid: uid, status: DATA_REMOVED },
      { _id: 0, clanid: 1 },
    ).lean();
    const clanListId = clanList.map((clan) => clan.clanid);

    // reduce clan member count
    await Clans.updateMany(
      { _id: { $in: clanListId } },
      { $inc: { members_count: 1 } },
    );
    // finding own clan
    const clans = await Clans.find(
      { uid, isBanned: true, is_active: false },
      { _id: 1 },
    ).lean();

    if (clans.length > 0) {
      const clansId = clans.map((clan) => clan._id);

      // setting status to be removed for member he own the clan and for which he is member
      await ClanMembers.updateMany(
        {
          $or: [
            { memberid: uid, status: DATA_REMOVED },
            { clanid: { $in: clansId } },
          ],
        },
        { $set: { status: DATA_ACTIVE } },
      );
      // *****need to work at clanMember queries
      await Clans.updateMany(
        { _id: { $in: clansId } },
        { $set: { isBanned: false, is_active: true, is_deleted: false } },
      );
    } else {
      await ClanMembers.updateMany(
        { memberid: uid, status: DATA_REMOVED },
        { $set: { status: DATA_ACTIVE } },
      );
    }

    return true;
  } catch (e) {
    logError('notificationManagement has error', e.stack);
    return false;
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
        ACCOUNT_ACTIVITY_DATE: `${currentDate.getDay()}/${
          currentDate.getMonth() + 1
        }/${currentDate.getFullYear()}`,
        ACCOUNT_ACTIVITY_BROWSER: deviceDetails?.client?.name,
        ACCOUNT_ACTIVITY_IP: ip,
        ACCOUNT_ACTIVITY_LOCATION: locationDetails?.location,
      },
    };

    await transactionEmail(data);
    return true;
  } catch (e) {
    logError('sendEmail has error in delete account', e);
    return false;
  }
};

const companyManage = async (userId) => {
  try {
    logInfo('company manage', userId);
    const company = await Users.findOneAndUpdate(
      {
        uid: userId,
        type: 'company',
        is_active: false,
        isDeleted: true,
      },
      {
        $set: {
          isDeleted: false,
          deletedAt: new Date(),
          deleteReason: 'revert company delete',
          is_active: true,
          is_deleted: false,
        },
      },
    );

    if (!company) {
      return true;
    }

    // eslint-disable-next-line no-use-before-define
    activeDeleteUserHandler(company, null)
      .then((result) => {
        logInfo('active delete company result', result);
      })
      .catch((er) => {
        logError('active delete has error', er);
      });
    return true;
  } catch (e) {
    logError('company manage has issue', e);
    return false;
  }
};

export const activeDeleteUserHandler = async (userInfo, req) => {
  const uid = Types.ObjectId(userInfo._id);

  if (req) {
    await new DeleteUserHistory({
      userId: uid,
      deleteReason: 'User activated his account',
      isReLogin: true,
    }).save();

    sendEmail(req, userInfo).then((result) => {
      logInfo('send email result', result);
    });

    //   sendinblue
    updateSendiblueContact({
      emailSubscription: true,
      email: userInfo.email,
    })
      .then((data) => {
        logInfo('BlackList status updated:', data);
      })
      .catch((err) => {
        logError('Error in updating blacklist status:', err);
      });

    //   public_addresses

    await PublicAddress.updateMany(
      { userId: uid, status: DATA_REMOVED },
      { $set: { status: DATA_ACTIVE } },
    );
  }

  await postDelete(uid);

  //   delete comment

  await commentDelete(uid);
  //   delete reply

  await replyDelete(uid);

  // connection management
  await connectionManagement(uid);

  //   notification management
  await notificationManagement(uid);

  //   remove from clan management
  await clanManagement(uid);

  //   remove from news management
  await newsManagement(uid);

  //   message management
  await activateSBUser(uid);

  await UserGiftSummaries.updateMany(
    { uid },
    { $set: { status: DATA_ACTIVE } },
  );
  await Wallets.findOneAndUpdate({ uid }, { $set: { status: DATA_ACTIVE } });

  await companyManage(uid);
  //   avatar??
  //   lounge??
  //   portfolio??
  //   more data from s3 bucket

  //   modulus manual active
};

// const postSupportDataDelete = async (uid) => {
//   try {
//     logInfo('postSupportDataDelete called');
//     await PostTransaction.updateMany(
//       { senderid: uid, status: DATA_REMOVED, type: POST_TRANSACTION },
//       { $set: { status: DATA_ACTIVE } },
//     );

//     const postTransactionList = await PostTransaction.find(
//       { senderid: uid, status: DATA_ACTIVE, type: POST_TRANSACTION },
//       { postid: 1 },
//     ).lean();

//     const bulkOpsArr = postTransactionList.forEach((post) => {
//       const { postid, gift_name: giftName } = post;
//       const filter = { _id: postid };
//       const update = {
//         $inc: { support: { [giftName]: 1 } },
//         $push: { supportedBy: { userId: uid } },
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

// const commentSupportDataDelete = async (uid) => {
//   try {
//     logInfo('postSupportDataDelete called');
//     await PostTransaction.updateMany(
//       { senderid: uid, status: DATA_REMOVED, type: COMMENT_TRANSACTION },
//       { $set: { status: DATA_ACTIVE } },
//     );

//     const commentTransactionList = await PostTransaction.find(
//       { senderid: uid, status: DATA_ACTIVE, type: COMMENT_TRANSACTION },
//       { commentid: 1 },
//     ).lean();

//     const bulkOpsArr = commentTransactionList.map((comment) => {
//       const { commentid, gift_name: giftName } = comment;
//       const filter = { _id: commentid };
//       const update = {
//         $inc: { support: { [giftName]: 1 } },
//         $push: { supportedBy: { userId: uid } },
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
export const test = 't';
