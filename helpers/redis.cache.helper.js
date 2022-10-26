import {
  Blocks,
  ClanMembers,
  Connections,
  Operations,
  PostHides,
  Posts,
  SharePost,
  Users,
} from '../database/db-models';
import { logError, logInfo } from './logger.helper';
import RedisClient from './redis';

let { TIME } = process.env;

TIME = TIME ? parseInt(TIME, 10) : 1440;

class Cache {
  // user who is suspended
  async getSuspendedUser() {
    try {
      const suspendedIds = await Users.find(
        { account_status: 'suspended' },
        { _id: 1 },
      ).lean();

      return suspendedIds.map((suspended) => suspended._id);
    } catch (e) {
      logError('error in getSuspendedUser', e);
      return [];
    }
  }

  async getBlockedUserIdFromRedis(req, uId, isSuspendedUser = true) {
    try {
      logInfo(`getRedisData ${uId}`);
      let blockUserIdList = [];
      let suspendedUser = [];

      if (isSuspendedUser) {
        const redisSuspendedData = await RedisClient.getAllSetValue(
          'suspendedUser',
        );

        if (redisSuspendedData && redisSuspendedData.length > 0) {
          suspendedUser = redisSuspendedData;
        } else {
          suspendedUser = await new Cache().getSuspendedUser(uId);
          // blockUserIdList = suspendedUser;
          await RedisClient.addSetValue('suspendedUser', suspendedUser, TIME);
        }
      }

      if (req.user.accessLevel !== 2) {
        const redisData = await RedisClient.getAllSetValue(
          `blockedUser_${uId}`,
        );

        if (redisData && redisData.length > 0) {
          blockUserIdList = [...redisData, ...suspendedUser];
        } else {
          const [userBlockYou, userBlockId] = await Promise.all([
            new Cache().getBlockFromUser(uId),
            new Cache().getBlockUser(uId),
          ]);

          blockUserIdList = [...userBlockYou, ...userBlockId];
          await RedisClient.addSetValue(
            `blockedUser_${uId}`,
            blockUserIdList,
            TIME,
          );

          blockUserIdList = [...userBlockYou, ...userBlockId, ...suspendedUser];
        }
      } else {
        blockUserIdList = suspendedUser;
      }

      return blockUserIdList;
    } catch (e) {
      logError(`get Redis Data${e}`);
      return [];
    }
  }

  // user that you block
  async getBlockUser(uid) {
    try {
      const blockUid = await Blocks.find({ uid }, { block: 1, _id: 0 }).lean();

      return blockUid.map((block) => block.block);
    } catch (e) {
      logError('error in getBlockUser', e);
      return [];
    }
  }

  // user who block you
  async getBlockFromUser(uid) {
    try {
      const blockUid = await Blocks.find(
        { block: uid },
        { uid: 1, _id: 0 },
      ).lean();

      return blockUid.map((block) => block.uid);
    } catch (e) {
      logError('error in getBlockFromUser', e);
      return [];
    }
  }

  async checkThreadCreate(userId) {
    try {
      const ttl = await RedisClient.getTTL(`${userId}_thread_created`);

      if (ttl > 0) {
        return ttl;
      }

      // await RedisClient.set(`${userId}_thread_created`, 1, 5);
      return 0;
    } catch (e) {
      return false;
    }
  }

  async addThreadCreate(userId, min) {
    try {
      await RedisClient.set(`${userId}_thread_created`, 1, min);
      return true;
    } catch (e) {
      return false;
    }
  }

  async getDiscoverData(req, uId, isSuspendedUser = true) {
    try {
      logInfo(`getRedisData getDiscoverData ${uId}`);
      if (req.user.accessLevel !== 2) {
        const data = await Promise.all([
          new Cache().getBlockedUserIdFromRedis(req, uId, isSuspendedUser),
          new Cache().getFollowUserRedis(uId),
          new Cache().getClanMemberRedis(uId),
          new Cache().hiddenPostIdRedis(uId),
        ]);

        return data;
      }

      const blockUserIdList = await new Cache().getBlockedUserIdFromRedis(
        req,
        uId,
        isSuspendedUser,
      );

      return blockUserIdList;
    } catch (e) {
      return [];
    }
  }

  async hiddenPostIdRedis(uId) {
    try {
      const hiddenPostId = await RedisClient.getAllSetValue(`hidePost${uId}`);

      if (hiddenPostId && hiddenPostId.length > 0) {
        return hiddenPostId;
      }

      const postIdHidden = await new Cache().hiddenPostId(uId);

      await RedisClient.addSetValue(`hidePost${uId}`, postIdHidden, TIME);
      return postIdHidden;
    } catch (e) {
      return [];
    }
  }

  async hiddenPostId(uId) {
    try {
      const postHide = await PostHides.find(
        { uid: uId },
        { hide_post_id: 1, _id: 0 },
      ).lean();

      return postHide.map((post) => post.hide_post_id);
    } catch (e) {
      logError('error in hideenPostId', e);
      return [];
    }
  }

  async getOperationPinPostsRedis(uId) {
    try {
      const operationPost = await RedisClient.get('operationalPost');

      if (operationPost) {
        return JSON.parse(operationPost);
      }

      const postId = await new Cache().getOperationPinPosts();

      if (!postId) {
        await RedisClient.set('operationalPost', JSON.stringify([]), TIME);
        return {};
      }

      let whereObj = {};

      if (Array.isArray(postId)) {
        whereObj = {
          _id: { $in: postId },
          is_deleted: { $ne: true },
        };
      } else {
        whereObj = {
          _id: postId,
          is_deleted: { $ne: true },
        };
      }

      const post = await new Cache().getPostAggregation(
        uId,
        whereObj,
        0,
        5,
        [],
        uId,
      );

      await RedisClient.set('operationalPost', JSON.stringify(post), TIME);
      return post;
    } catch (e) {
      logError('getOpeationPinPostsRedis ', e);
      return [];
    }
  }

  async getOperationPinPosts() {
    try {
      const post = await Operations.findOne(
        { name: 'discover_pinned_post' },
        { postid: 1 },
      );
      const postid =
        typeof post.postid === 'string' ? [post.postid] : post.postid;

      return postid;
    } catch (e) {
      logError('getOpeationPinPosts has error', e);
      return [];
    }
  }

  async getPostAggregation(
    uId,
    whereObj,
    skip,
    limit,
    blockUserIdList,
    myuId,
    followUserId = [],
    sort = { _id: -1 },
  ) {
    const posts = await Posts.aggregate([
      { $match: whereObj },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'transactions',
          let: { transactionPostId: '$_id' },
          as: 'support',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                wallet: 'support',
              },
            },
            {
              $group: {
                _id: '$gift_name',
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                gift_name: '$_id',
                count: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          support: {
            $map: {
              input: '$support',
              as: 'bad',
              in: {
                v: '$$bad.count',
                k: '$$bad.gift_name',
              },
            },
          },
        },
      },
      {
        $addFields: {
          support: { $arrayToObject: '$support' },
        },
      },
      {
        $lookup: {
          from: 'saved_posts',
          as: 'postSaved',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          is_post_saved: {
            $anyElementTrue: ['$postSaved'],
          },
        },
      },
      {
        $lookup: {
          from: 'post_likes',
          as: 'postLike',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                status: true,
              },
            },
          ],
        },
      },
      // { $unwind: { path: '$postLike', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_liked: {
            $anyElementTrue: ['$postLike'],
          },
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: { $in: followUserId },
                remark: 'spread',
              },
            },
            { $sort: { created_at: -1 } },
            { $limit: 3 },
            {
              $project: {
                uid: 1,
                postid: 1,
                remark: 1,
                updated_at: 1,
              },
            },
            {
              $lookup: {
                from: 'users',
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
          ],
          as: 'spread_user',
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                remark: { $ne: 'spread' },
              },
            },
          ],
          as: 'isSharePost',
        },
      },
      // { $unwind: { path: '$isSharePost', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_shared: {
            $anyElementTrue: ['$isSharePost'],
          },
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                remark: 'spread',
              },
            },
          ],
          as: 'isSpreadPost',
        },
      },
      // { $unwind: { path: '$isSpreadPost', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_post_spread: {
            $anyElementTrue: ['$isSpreadPost'],
          },
        },
      },
      {
        $lookup: {
          from: 'votes',
          localField: '_id',
          foreignField: 'postid',
          as: 'votes',
          pipeline: [
            {
              $match: {
                is_deleted: { $ne: true },
              },
            },
            {
              $project: {
                postid: 1,
                poll: 1,
                uid: 1,
              },
            },
            {
              $group: {
                _id: '$postid',
                count: { $sum: 1 },
                is_voted: {
                  $push: {
                    $cond: [{ $eq: ['$uid', myuId] }, '$poll', '$$REMOVE'],
                  },
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$votes', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          total_vote: {
            $cond: [{ $ifNull: ['$votes', false] }, '$votes.count', 0],
          },
          is_voted: {
            $cond: [{ $ifNull: ['$votes', false] }, '$votes.is_voted', []],
          },
        },
      },
      {
        $lookup: {
          from: 'comment_hides',
          as: 'hidecomment',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                is_hide: true,
              },
            },
            {
              $group: {
                _id: {
                  postid: '$postid',
                  uid: '$uid',
                },
                commentids: {
                  $push: {
                    $toObjectId: '$commentid',
                  },
                },
              },
            },
            {
              $project: {
                commentids: 1,
                _id: 0,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$hidecomment', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          hidecommentIdArr: {
            $cond: [
              { $ifNull: ['$hidecomment', false] },
              '$hidecomment.commentids',
              [],
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'comments',
          as: 'comments',
          let: { postId: '$_id', hidecommentIdArr1: '$hidecommentIdArr' },
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                is_deleted: { $ne: true },
                uid: { $nin: blockUserIdList },
                $expr: { $not: { $in: ['$_id', '$$hidecommentIdArr1'] } },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'transactions',
                as: 'support',
                let: {
                  commentUid: '$uid',
                },
                localField: 'postid',
                foreignField: 'postid',
                pipeline: [
                  {
                    $match: {
                      $and: [
                        {
                          $expr: { $eq: ['$wallet', 'support'] },
                        },
                        {
                          $expr: { $eq: ['$senderid', '$$commentUid'] },
                        },
                      ],
                    },
                  },
                  {
                    $group: {
                      _id: '$gift_name',
                      count: { $sum: 1 },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      gift_name: '$_id',
                      count: 1,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                support: {
                  $map: {
                    input: '$support',
                    as: 'bad',
                    in: {
                      v: '$$bad.count',
                      k: '$$bad.gift_name',
                    },
                  },
                },
              },
            },
            {
              $addFields: {
                support: { $arrayToObject: '$support' },
              },
            },
            {
              $lookup: {
                from: 'comment_likes',
                as: 'commentLikes',
                localField: '_id',
                foreignField: 'commentid',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                    },
                  },
                ],
              },
            },
            // { $unwind: { path: '$commentLikes', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_liked: {
                  $anyElementTrue: ['$commentLikes'],
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$uid' },
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $lookup: {
                      from: 'connections',
                      as: 'conn',
                      localField: '_id',
                      foreignField: 'follow',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      is_following: {
                        $anyElementTrue: ['$conn'],
                      },
                    },
                  },
                  {
                    $project: {
                      is_following: 1,
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
            {
              $lookup: {
                from: 'reply_hides',
                as: 'hidereply',
                localField: '_id',
                foreignField: 'commentid',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                      is_hide: true,
                    },
                  },
                  {
                    $group: {
                      _id: {
                        postid: '$commentid',
                        uid: '$uid',
                      },
                      replyids: {
                        $push: {
                          $toObjectId: '$replyid',
                        },
                      },
                    },
                  },
                  {
                    $project: {
                      replyids: 1,
                      _id: 0,
                    },
                  },
                ],
              },
            },
            {
              $unwind: { path: '$hidereply', preserveNullAndEmptyArrays: true },
            },
            {
              $addFields: {
                hidereplyArr: {
                  $cond: [
                    { $ifNull: ['$hidereply', false] },
                    '$hidereply.replyids',
                    [],
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'replies',
                as: 'replies',
                localField: '_id',
                foreignField: 'commentid',
                let: { commentId: '$_id', hidereplyIdArr1: '$hidereplyArr' },
                pipeline: [
                  {
                    $match: {
                      is_deleted: { $ne: true },
                      uid: { $nin: blockUserIdList },
                      $expr: { $not: { $in: ['$_id', '$$hidereplyIdArr1'] } },
                    },
                  },
                  { $sort: { createdAt: 1 } },
                  { $limit: 5 },
                  {
                    $lookup: {
                      from: 'transactions',
                      as: 'support',
                      localField: 'postid',
                      foreignField: 'postid',
                      let: {
                        commentUid: '$uid',
                      },
                      pipeline: [
                        {
                          $match: {
                            $and: [
                              {
                                $expr: { $eq: ['$wallet', 'support'] },
                              },
                              {
                                $expr: { $eq: ['$senderid', '$$commentUid'] },
                              },
                            ],
                          },
                        },
                        {
                          $group: {
                            _id: '$gift_name',
                            count: { $sum: 1 },
                          },
                        },
                        {
                          $project: {
                            _id: 0,
                            gift_name: '$_id',
                            count: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      support: {
                        $map: {
                          input: '$support',
                          as: 'bad',
                          in: {
                            v: '$$bad.count',
                            k: '$$bad.gift_name',
                          },
                        },
                      },
                    },
                  },
                  {
                    $addFields: {
                      support: { $arrayToObject: '$support' },
                    },
                  },
                  {
                    $lookup: {
                      from: 'reply_likes',
                      as: 'replyLikes',
                      localField: '_id',
                      foreignField: 'replyid',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  // { $unwind: { path: '$replyLikes', preserveNullAndEmptyArrays: true } },
                  {
                    $addFields: {
                      is_liked: {
                        $anyElementTrue: ['$replyLikes'],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'uid',
                      foreignField: '_id',
                      as: 'user',
                      pipeline: [
                        {
                          $lookup: {
                            from: 'connections',
                            as: 'conn',
                            let: { followUid: '$_id' },
                            localField: '_id',
                            foreignField: 'follow',
                            pipeline: [
                              {
                                $match: {
                                  uid: myuId,
                                },
                              },
                            ],
                          },
                        },
                        {
                          $addFields: {
                            is_following: {
                              $anyElementTrue: ['$conn'],
                            },
                          },
                        },
                        {
                          $project: {
                            is_following: 1,
                            name: 1,
                            username: 1,
                            profile_pic: 1,
                            tagline: 1,
                            followers_count: 1,
                            following_count: 1,
                            member: 1,
                            default_tag: 1,
                            motto: 1,
                            position: 1,
                            company: 1,
                            badge: 1,
                          },
                        },
                      ],
                    },
                  },
                  { $unwind: '$user' },
                ],
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'users',
          as: 'user',
          localField: 'uid',
          foreignField: '_id',
          pipeline: [
            {
              $lookup: {
                from: 'connections',
                as: 'conn',
                localField: '_id',
                foreignField: 'follow',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                is_following: {
                  $anyElementTrue: ['$conn'],
                },
              },
            },
            {
              $project: {
                is_following: 1,
                _id: 1,
                name: 1,
                username: 1,
                profile_pic: 1,
                tagline: 1,
                followers_count: 1,
                following_count: 1,
                member: 1,
                default_tag: 1,
                motto: 1,
                position: 1,
                company: 1,
                badge: 1,
              },
            },
          ],
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'clans',
          as: 'clan',
          localField: 'clanid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                id: 1,
                profile_pic: 1,
                information: 1,
                members_count: 1,
                cover_pic: 1,
                clan: 1,
                uid: 1,
              },
            },
            {
              $lookup: {
                from: 'clan_members',
                as: 'clanMem',
                localField: '_id',
                foreignField: 'clanid',
                pipeline: [
                  {
                    $match: {
                      memberid: myuId,
                      is_accepted: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clanMem', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_joined: {
                  $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                },
                role: '$clanMem.role',
                is_my_clan: {
                  $cond: [{ $eq: ['$uid', myuId] }, true, false],
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$clan', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'airdrops',
          localField: 'share_airdropid',
          foreignField: '_id',
          as: 'share_airdropid',
        },
      },
      {
        $unwind: { path: '$share_airdropid', preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: 'users',
          as: 'company',
          localField: 'companyid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                username: 1,
                profile_pic: 1,
                tagline: 1,
                followers_count: 1,
                following_count: 1,
                member: 1,
                default_tag: 1,
                motto: 1,
                position: 1,
                company: 1,
                badge: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'clans',
          as: 'shared_clanid',
          localField: 'shared_clanid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                id: 1,
                profile_pic: 1,
                information: 1,
                members_count: 1,
                cover_pic: 1,
                clan: 1,
              },
            },
            {
              $lookup: {
                from: 'clan_members',
                let: { clanId: '$_id' },
                as: 'clanMem',
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$clanid', '$$clanId'] },
                      memberid: myuId,
                      is_accepted: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clanMem', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_joined: {
                  $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                },
                role: '$clanMem.role',
                is_my_clan: {
                  $cond: [{ $eq: ['$uid', myuId] }, true, false],
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$shared_clanid', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'posts',
          let: { reshareid: '$reshareid' },
          as: 'reshare',
          localField: 'reshareid',
          foreignField: '_id',
          pipeline: [
            {
              $match: {
                uid: { $nin: blockUserIdList },
                is_deleted: { $ne: true },
              },
            },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$uid' },
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $lookup: {
                      from: 'connections',
                      as: 'conn',
                      localField: '_id',
                      foreignField: 'follow',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      is_following: {
                        $anyElementTrue: ['$conn'],
                      },
                    },
                  },
                  {
                    $project: {
                      is_following: 1,
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
            {
              $lookup: {
                from: 'votes',
                localField: '_id',
                foreignField: 'postid',
                as: 'votesReshare',
                pipeline: [
                  {
                    $match: {
                      is_deleted: { $ne: true },
                    },
                  },
                  {
                    $project: {
                      postid: 1,
                      poll: 1,
                      uid: 1,
                    },
                  },
                  {
                    $group: {
                      _id: '$postid',
                      count: { $sum: 1 },
                      is_voted: {
                        $push: {
                          $cond: [
                            { $eq: ['$uid', myuId] },
                            '$poll',
                            '$$REMOVE',
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$votesReshare',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                total_vote: {
                  $cond: [
                    { $ifNull: ['$votesReshare', false] },
                    '$votesReshare.count',
                    0,
                  ],
                },
                is_voted: {
                  $cond: [
                    { $ifNull: ['$votes', false] },
                    '$votes.is_voted',
                    [],
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'clans',
                as: 'clan',
                localField: 'clanid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      id: 1,
                      profile_pic: 1,
                      information: 1,
                      members_count: 1,
                      cover_pic: 1,
                      clan: 1,
                    },
                  },
                  {
                    $lookup: {
                      from: 'clan_members',
                      localField: '_id',
                      foreignField: 'clanid',
                      as: 'clanMem',
                      pipeline: [
                        {
                          $match: {
                            memberid: myuId,
                            is_accepted: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: '$clanMem',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      is_joined: {
                        $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                      },
                      role: '$clanMem.role',
                      is_my_clan: {
                        $cond: [{ $eq: ['$uid', myuId] }, true, false],
                      },
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clan', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'airdrops',
                as: 'share_airdropid',
                localField: 'share_airdropid',
                foreignField: '_id',
              },
            },
            {
              $unwind: {
                path: '$share_airdropid',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'users',
                as: 'company',
                localField: 'companyid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'clans',
                localField: 'shared_clanid',
                foreignField: '_id',
                as: 'shared_clanid',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      id: 1,
                      profile_pic: 1,
                      information: 1,
                      members_count: 1,
                      cover_pic: 1,
                      clan: 1,
                    },
                  },
                  {
                    $lookup: {
                      from: 'clan_members',
                      localField: '_id',
                      foreignField: 'clanid',
                      as: 'clanMem',
                      pipeline: [
                        {
                          $match: {
                            memberid: myuId,
                            is_accepted: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: '$clanMem',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      is_joined: {
                        $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                      },
                      role: '$clanMem.role',
                      is_my_clan: {
                        $cond: [{ $eq: ['$uid', myuId] }, true, false],
                      },
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$shared_clanid',
                preserveNullAndEmptyArrays: true,
              },
            },
            { $project: { votesReshare: 0 } },
          ],
        },
      },
      { $unwind: { path: '$reshare', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          'shared_clanid.clanMem': 0,
          'reshare.isSpreadPost': 0,
          'reshare.isSharePost': 0,
          'reshare.postSaved': 0,
          'reshare.postLike': 0,
          'reshare.votes': 0,
          isSpreadPost: 0,
          isSharePost: 0,
          postSaved: 0,
          postLike: 0,
          votes: 0,
          hidecommentIdArr: 0,
          'comments.replies.replyLikes': 0,
          'comments.commentLikes': 0,
          'comments.hidereplyArr': 0,
          'comments.hidereply': 0,
          'clan.clanMem': 0,
          hidecomment: 0,
        },
      },
    ]).option({ allowDiskUse: true, readPreference: 'secondary' });
    // {
    //   $group: {
    //     _id: null,
    //       posts: {
    //       $push: {
    //         k: { $toString: '$_id' },
    //         v: '$$ROOT',
    //         },
    //     },
    //   },
    // },
    // {
    //   $replaceWith: {
    //     $arrayToObject: '$posts',
    //     },
    // },

    return {
      finalResult: posts,
      count: posts.length,
    };
  }

  async getPostAggregationSearch(
    search,
    skip,
    limit,
    blockUserIdList,
    myuId,
    followUserId = [],
  ) {
    const posts = await Posts.aggregate([
      {
        $search: search,
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: 'transactions',
          let: { transactionPostId: '$_id' },
          as: 'support',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                wallet: 'support',
              },
            },
            {
              $group: {
                _id: '$gift_name',
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                gift_name: '$_id',
                count: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          support: {
            $map: {
              input: '$support',
              as: 'bad',
              in: {
                v: '$$bad.count',
                k: '$$bad.gift_name',
              },
            },
          },
        },
      },
      {
        $addFields: {
          support: { $arrayToObject: '$support' },
        },
      },
      {
        $lookup: {
          from: 'saved_posts',
          as: 'postSaved',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          is_post_saved: {
            $anyElementTrue: ['$postSaved'],
          },
        },
      },
      {
        $lookup: {
          from: 'post_likes',
          as: 'postLike',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                status: true,
              },
            },
          ],
        },
      },
      // { $unwind: { path: '$postLike', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_liked: {
            $anyElementTrue: ['$postLike'],
          },
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: { $in: followUserId },
                remark: 'spread',
              },
            },
            { $sort: { created_at: -1 } },
            { $limit: 3 },
            {
              $project: {
                uid: 1,
                postid: 1,
                remark: 1,
                updated_at: 1,
              },
            },
            {
              $lookup: {
                from: 'users',
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
          ],
          as: 'spread_user',
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                remark: { $ne: 'spread' },
              },
            },
          ],
          as: 'isSharePost',
        },
      },
      // { $unwind: { path: '$isSharePost', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_shared: {
            $anyElementTrue: ['$isSharePost'],
          },
        },
      },
      {
        $lookup: {
          from: 'share_posts',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                remark: 'spread',
              },
            },
          ],
          as: 'isSpreadPost',
        },
      },
      // { $unwind: { path: '$isSpreadPost', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          is_post_spread: {
            $anyElementTrue: ['$isSpreadPost'],
          },
        },
      },
      {
        $lookup: {
          from: 'votes',
          localField: '_id',
          foreignField: 'postid',
          as: 'votes',
          pipeline: [
            {
              $match: {
                is_deleted: { $ne: true },
              },
            },
            {
              $project: {
                postid: 1,
                poll: 1,
                uid: 1,
              },
            },
            {
              $group: {
                _id: '$postid',
                count: { $sum: 1 },
                is_voted: {
                  $push: {
                    $cond: [{ $eq: ['$uid', myuId] }, '$poll', '$$REMOVE'],
                  },
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$votes', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          total_vote: {
            $cond: [{ $ifNull: ['$votes', false] }, '$votes.count', 0],
          },
          is_voted: {
            $cond: [{ $ifNull: ['$votes', false] }, '$votes.is_voted', []],
          },
        },
      },
      {
        $lookup: {
          from: 'comment_hides',
          as: 'hidecomment',
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                uid: myuId,
                is_hide: true,
              },
            },
            {
              $group: {
                _id: {
                  postid: '$postid',
                  uid: '$uid',
                },
                commentids: {
                  $push: {
                    $toObjectId: '$commentid',
                  },
                },
              },
            },
            {
              $project: {
                commentids: 1,
                _id: 0,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$hidecomment', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          hidecommentIdArr: {
            $cond: [
              { $ifNull: ['$hidecomment', false] },
              '$hidecomment.commentids',
              [],
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'comments',
          as: 'comments',
          let: { postId: '$_id', hidecommentIdArr1: '$hidecommentIdArr' },
          localField: '_id',
          foreignField: 'postid',
          pipeline: [
            {
              $match: {
                is_deleted: { $ne: true },
                uid: { $nin: blockUserIdList },
                $expr: { $not: { $in: ['$_id', '$$hidecommentIdArr1'] } },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            {
              $lookup: {
                from: 'transactions',
                as: 'support',
                let: {
                  commentUid: '$uid',
                },
                localField: 'postid',
                foreignField: 'postid',
                pipeline: [
                  {
                    $match: {
                      $and: [
                        {
                          $expr: { $eq: ['$wallet', 'support'] },
                        },
                        {
                          $expr: { $eq: ['$senderid', '$$commentUid'] },
                        },
                      ],
                    },
                  },
                  {
                    $group: {
                      _id: '$gift_name',
                      count: { $sum: 1 },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      gift_name: '$_id',
                      count: 1,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                support: {
                  $map: {
                    input: '$support',
                    as: 'bad',
                    in: {
                      v: '$$bad.count',
                      k: '$$bad.gift_name',
                    },
                  },
                },
              },
            },
            {
              $addFields: {
                support: { $arrayToObject: '$support' },
              },
            },
            {
              $lookup: {
                from: 'comment_likes',
                as: 'commentLikes',
                localField: '_id',
                foreignField: 'commentid',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                    },
                  },
                ],
              },
            },
            // { $unwind: { path: '$commentLikes', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_liked: {
                  $anyElementTrue: ['$commentLikes'],
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$uid' },
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $lookup: {
                      from: 'connections',
                      as: 'conn',
                      localField: '_id',
                      foreignField: 'follow',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      is_following: {
                        $anyElementTrue: ['$conn'],
                      },
                    },
                  },
                  {
                    $project: {
                      is_following: 1,
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
            {
              $lookup: {
                from: 'reply_hides',
                as: 'hidereply',
                localField: '_id',
                foreignField: 'commentid',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                      is_hide: true,
                    },
                  },
                  {
                    $group: {
                      _id: {
                        postid: '$commentid',
                        uid: '$uid',
                      },
                      replyids: {
                        $push: {
                          $toObjectId: '$replyid',
                        },
                      },
                    },
                  },
                  {
                    $project: {
                      replyids: 1,
                      _id: 0,
                    },
                  },
                ],
              },
            },
            {
              $unwind: { path: '$hidereply', preserveNullAndEmptyArrays: true },
            },
            {
              $addFields: {
                hidereplyArr: {
                  $cond: [
                    { $ifNull: ['$hidereply', false] },
                    '$hidereply.replyids',
                    [],
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'replies',
                as: 'replies',
                localField: '_id',
                foreignField: 'commentid',
                let: { commentId: '$_id', hidereplyIdArr1: '$hidereplyArr' },
                pipeline: [
                  {
                    $match: {
                      is_deleted: { $ne: true },
                      uid: { $nin: blockUserIdList },
                      $expr: { $not: { $in: ['$_id', '$$hidereplyIdArr1'] } },
                    },
                  },
                  { $sort: { createdAt: 1 } },
                  { $limit: 5 },
                  {
                    $lookup: {
                      from: 'transactions',
                      as: 'support',
                      localField: 'postid',
                      foreignField: 'postid',
                      let: {
                        commentUid: '$uid',
                      },
                      pipeline: [
                        {
                          $match: {
                            $and: [
                              {
                                $expr: { $eq: ['$wallet', 'support'] },
                              },
                              {
                                $expr: { $eq: ['$senderid', '$$commentUid'] },
                              },
                            ],
                          },
                        },
                        {
                          $group: {
                            _id: '$gift_name',
                            count: { $sum: 1 },
                          },
                        },
                        {
                          $project: {
                            _id: 0,
                            gift_name: '$_id',
                            count: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      support: {
                        $map: {
                          input: '$support',
                          as: 'bad',
                          in: {
                            v: '$$bad.count',
                            k: '$$bad.gift_name',
                          },
                        },
                      },
                    },
                  },
                  {
                    $addFields: {
                      support: { $arrayToObject: '$support' },
                    },
                  },
                  {
                    $lookup: {
                      from: 'reply_likes',
                      as: 'replyLikes',
                      localField: '_id',
                      foreignField: 'replyid',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  // { $unwind: { path: '$replyLikes', preserveNullAndEmptyArrays: true } },
                  {
                    $addFields: {
                      is_liked: {
                        $anyElementTrue: ['$replyLikes'],
                      },
                    },
                  },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'uid',
                      foreignField: '_id',
                      as: 'user',
                      pipeline: [
                        {
                          $lookup: {
                            from: 'connections',
                            as: 'conn',
                            let: { followUid: '$_id' },
                            localField: '_id',
                            foreignField: 'follow',
                            pipeline: [
                              {
                                $match: {
                                  uid: myuId,
                                },
                              },
                            ],
                          },
                        },
                        {
                          $addFields: {
                            is_following: {
                              $anyElementTrue: ['$conn'],
                            },
                          },
                        },
                        {
                          $project: {
                            is_following: 1,
                            name: 1,
                            username: 1,
                            profile_pic: 1,
                            tagline: 1,
                            followers_count: 1,
                            following_count: 1,
                            member: 1,
                            default_tag: 1,
                            motto: 1,
                            position: 1,
                            company: 1,
                            badge: 1,
                          },
                        },
                      ],
                    },
                  },
                  { $unwind: '$user' },
                ],
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'users',
          as: 'user',
          localField: 'uid',
          foreignField: '_id',
          pipeline: [
            {
              $lookup: {
                from: 'connections',
                as: 'conn',
                localField: '_id',
                foreignField: 'follow',
                pipeline: [
                  {
                    $match: {
                      uid: myuId,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                is_following: {
                  $anyElementTrue: ['$conn'],
                },
              },
            },
            {
              $project: {
                is_following: 1,
                _id: 1,
                name: 1,
                username: 1,
                profile_pic: 1,
                tagline: 1,
                followers_count: 1,
                following_count: 1,
                member: 1,
                default_tag: 1,
                motto: 1,
                position: 1,
                company: 1,
                badge: 1,
              },
            },
          ],
        },
      },
      { $unwind: '$user' },
      {
        $lookup: {
          from: 'clans',
          as: 'clan',
          localField: 'clanid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                id: 1,
                profile_pic: 1,
                information: 1,
                members_count: 1,
                cover_pic: 1,
                clan: 1,
                uid: 1,
              },
            },
            {
              $lookup: {
                from: 'clan_members',
                as: 'clanMem',
                localField: '_id',
                foreignField: 'clanid',
                pipeline: [
                  {
                    $match: {
                      memberid: myuId,
                      is_accepted: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clanMem', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_joined: {
                  $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                },
                role: '$clanMem.role',
                is_my_clan: {
                  $cond: [{ $eq: ['$uid', myuId] }, true, false],
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$clan', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'airdrops',
          localField: 'share_airdropid',
          foreignField: '_id',
          as: 'share_airdropid',
        },
      },
      {
        $unwind: { path: '$share_airdropid', preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: 'users',
          as: 'company',
          localField: 'companyid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                username: 1,
                profile_pic: 1,
                tagline: 1,
                followers_count: 1,
                following_count: 1,
                member: 1,
                default_tag: 1,
                motto: 1,
                position: 1,
                company: 1,
                badge: 1,
              },
            },
          ],
        },
      },
      { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'clans',
          as: 'shared_clanid',
          localField: 'shared_clanid',
          foreignField: '_id',
          pipeline: [
            {
              $project: {
                _id: 1,
                name: 1,
                id: 1,
                profile_pic: 1,
                information: 1,
                members_count: 1,
                cover_pic: 1,
                clan: 1,
              },
            },
            {
              $lookup: {
                from: 'clan_members',
                let: { clanId: '$_id' },
                as: 'clanMem',
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$clanid', '$$clanId'] },
                      memberid: myuId,
                      is_accepted: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clanMem', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                is_joined: {
                  $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                },
                role: '$clanMem.role',
                is_my_clan: {
                  $cond: [{ $eq: ['$uid', myuId] }, true, false],
                },
              },
            },
          ],
        },
      },
      { $unwind: { path: '$shared_clanid', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'posts',
          let: { reshareid: '$reshareid' },
          as: 'reshare',
          localField: 'reshareid',
          foreignField: '_id',
          pipeline: [
            {
              $match: {
                uid: { $nin: blockUserIdList },
                is_deleted: { $ne: true },
              },
            },
            {
              $lookup: {
                from: 'users',
                let: { userId: '$uid' },
                as: 'user',
                localField: 'uid',
                foreignField: '_id',
                pipeline: [
                  {
                    $lookup: {
                      from: 'connections',
                      as: 'conn',
                      localField: '_id',
                      foreignField: 'follow',
                      pipeline: [
                        {
                          $match: {
                            uid: myuId,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $addFields: {
                      is_following: {
                        $anyElementTrue: ['$conn'],
                      },
                    },
                  },
                  {
                    $project: {
                      is_following: 1,
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$user' },
            {
              $lookup: {
                from: 'votes',
                localField: '_id',
                foreignField: 'postid',
                as: 'votesReshare',
                pipeline: [
                  {
                    $match: {
                      is_deleted: { $ne: true },
                    },
                  },
                  {
                    $project: {
                      postid: 1,
                      poll: 1,
                      uid: 1,
                    },
                  },
                  {
                    $group: {
                      _id: '$postid',
                      count: { $sum: 1 },
                      is_voted: {
                        $push: {
                          $cond: [
                            { $eq: ['$uid', myuId] },
                            '$poll',
                            '$$REMOVE',
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$votesReshare',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                total_vote: {
                  $cond: [
                    { $ifNull: ['$votesReshare', false] },
                    '$votesReshare.count',
                    0,
                  ],
                },
                is_voted: {
                  $cond: [
                    { $ifNull: ['$votes', false] },
                    '$votes.is_voted',
                    [],
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'clans',
                as: 'clan',
                localField: 'clanid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      id: 1,
                      profile_pic: 1,
                      information: 1,
                      members_count: 1,
                      cover_pic: 1,
                      clan: 1,
                    },
                  },
                  {
                    $lookup: {
                      from: 'clan_members',
                      localField: '_id',
                      foreignField: 'clanid',
                      as: 'clanMem',
                      pipeline: [
                        {
                          $match: {
                            memberid: myuId,
                            is_accepted: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: '$clanMem',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      is_joined: {
                        $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                      },
                      role: '$clanMem.role',
                      is_my_clan: {
                        $cond: [{ $eq: ['$uid', myuId] }, true, false],
                      },
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$clan', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'airdrops',
                as: 'share_airdropid',
                localField: 'share_airdropid',
                foreignField: '_id',
              },
            },
            {
              $unwind: {
                path: '$share_airdropid',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'users',
                as: 'company',
                localField: 'companyid',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      username: 1,
                      profile_pic: 1,
                      tagline: 1,
                      followers_count: 1,
                      following_count: 1,
                      member: 1,
                      default_tag: 1,
                      motto: 1,
                      position: 1,
                      company: 1,
                      badge: 1,
                    },
                  },
                ],
              },
            },
            { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'clans',
                localField: 'shared_clanid',
                foreignField: '_id',
                as: 'shared_clanid',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      id: 1,
                      profile_pic: 1,
                      information: 1,
                      members_count: 1,
                      cover_pic: 1,
                      clan: 1,
                    },
                  },
                  {
                    $lookup: {
                      from: 'clan_members',
                      localField: '_id',
                      foreignField: 'clanid',
                      as: 'clanMem',
                      pipeline: [
                        {
                          $match: {
                            memberid: myuId,
                            is_accepted: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: '$clanMem',
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $addFields: {
                      is_joined: {
                        $cond: [{ $ifNull: ['$clanMem', false] }, true, false],
                      },
                      role: '$clanMem.role',
                      is_my_clan: {
                        $cond: [{ $eq: ['$uid', myuId] }, true, false],
                      },
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$shared_clanid',
                preserveNullAndEmptyArrays: true,
              },
            },
            { $project: { votesReshare: 0 } },
          ],
        },
      },
      { $unwind: { path: '$reshare', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'news',
          localField: 'share_newsid',
          foreignField: '_id',
          as: 'news',
        },
      },
      {
        $unwind: { path: '$news', preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          'shared_clanid.clanMem': 0,
          'reshare.isSpreadPost': 0,
          'reshare.isSharePost': 0,
          'reshare.postSaved': 0,
          'reshare.postLike': 0,
          'reshare.votes': 0,
          isSpreadPost: 0,
          isSharePost: 0,
          postSaved: 0,
          postLike: 0,
          votes: 0,
          hidecommentIdArr: 0,
          'comments.replies.replyLikes': 0,
          'comments.commentLikes': 0,
          'comments.hidereplyArr': 0,
          'comments.hidereply': 0,
          'clan.clanMem': 0,
          hidecomment: 0,
        },
      },
    ]).option({ allowDiskUse: true, readPreference: 'secondary' });

    logInfo('getPostAggregationSearch result found');
    // {
    //   $group: {
    //     _id: null,
    //       posts: {
    //       $push: {
    //         k: { $toString: '$_id' },
    //         v: '$$ROOT',
    //         },
    //     },
    //   },
    // },
    // {
    //   $replaceWith: {
    //     $arrayToObject: '$posts',
    //     },
    // },

    return {
      finalResult: posts,
      count: posts.length,
    };
  }

  async getClanMemberRedis(uId) {
    try {
      const followUserIdRedis = await RedisClient.getAllSetValue(
        `userClanId${uId}`,
      );

      if (followUserIdRedis && followUserIdRedis.length > 0) {
        return followUserIdRedis;
      }

      const followUserId = await new Cache().getClanMember(uId);

      await RedisClient.addSetValue(`userClanId${uId}`, followUserId, TIME);
      return followUserId;
    } catch (e) {
      return [];
    }
  }

  async getClanMember(uId) {
    try {
      const memberExists = await ClanMembers.find(
        { memberid: uId, is_accepted: 1 },
        { clanid: 1, _id: 0 },
      ).lean();

      return memberExists.map((member) => member.clanid);
    } catch (e) {
      logError('error in isClanMember', e);
      return [];
    }
  }

  async getFollowUserRedis(uId) {
    try {
      const followUserIdRedis = await RedisClient.getAllSetValue(
        `followUser${uId}`,
      );

      if (followUserIdRedis && followUserIdRedis.length > 0) {
        return followUserIdRedis;
      }

      const followUserId = await new Cache().getFollowUser(uId);

      await RedisClient.addSetValue(`followUser${uId}`, followUserId, TIME);
      return followUserId;
    } catch (e) {
      return [];
    }
  }

  async getFollowUser(uid) {
    try {
      const followUid = await Connections.find(
        { uid },
        { follow: 1, _id: 0 },
      ).lean();

      return followUid.map((follow) => follow.follow);
    } catch (e) {
      logError('error in getFollowUser', e);
      return [];
    }
  }

  async getUserByUserNameRedis(username) {
    try {
      const usernameRedis = await RedisClient.get(`username${username}`);
      let userNameInfo = null;

      if (usernameRedis) {
        userNameInfo = JSON.parse(usernameRedis);
        return userNameInfo;
      }

      userNameInfo = await Users.findOne(
        { username, is_active: true },
        { _id: 1 },
      ).lean();

      await RedisClient.set(
        `username${username}`,
        JSON.stringify(userNameInfo),
        TIME,
      );

      return userNameInfo;
    } catch (err) {
      logError('error in getFollowUser', err);
      return false;
    }
  }

  async getSpreadPostIdRedis(uid, followerId, postIdG, postIdL) {
    try {
      const redisSpreadPost = await RedisClient.getAllSetValue(`spread_${uid}`);

      if (redisSpreadPost && redisSpreadPost.length > 0) {
        return redisSpreadPost;
      }

      const spreadPost = await SharePost.find(
        {
          uid: { $in: followerId },
          remark: 'spread',
          postid: { $gt: postIdG, $lt: postIdL },
        },
        { postid: 1, _id: 0 },
      ).lean();
      const postId = spreadPost.map((p) => p.postid);

      await RedisClient.addSetValue(`spread_${uid}`, postId, 3);
      return postId;
    } catch (e) {
      logError(`getSpreadPostId has error${e.stack}`, e);
      return [];
    }
  }

  async updateRedis(key, data) {
    try {
      await RedisClient.addSetValueSingle(key, data);
      // if (!redisData) {
      //   redisData = [];
      //   redisData = [data];
      // } else {
      //   redisData = JSON.parse(redisData);
      //   redisData.push(data);
      // }
      // await RedisClient.set(key, JSON.stringify(redisData), TIME);
      return true;
    } catch (err) {
      logError('error in updateRedis', err);
      return null;
    }
  }

  async removeRedis(key, data) {
    try {
      const redisData = await RedisClient.removeSetValue(key, data);

      if (redisData) {
        return true;
      }

      return false;
    } catch (err) {
      logError('error in removeRedis', err);
      return null;
    }
  }

  async deleteKey(key) {
    try {
      await RedisClient.delete(key);
      return true;
    } catch (err) {
      logError('error in deleteKey', err);
      return null;
    }
  }

  async setSuggestionData(uid) {
    try {
      // TODO: reset cache time from 5 mins to 20 mins after testing
      await RedisClient.set(`suggest_${uid}`, 1, 5);
      return true;
    } catch (err) {
      logError('error in deleteKey', err);
      return null;
    }
  }

  async getSuggestionData(uid) {
    try {
      const data = await RedisClient.get(`suggest_${uid}`);

      return data;
    } catch (err) {
      logError('error in deleteKey', err);
      return null;
    }
  }

  async getGivenUserId(username) {
    try {
      const data = await RedisClient.getAllSetValue('givenuserid');

      if (data && data.length > 0) {
        return data;
      }

      const userId = await Cache.setGivenUserId(username);

      return userId;
    } catch (err) {
      logError('error in getGivenUserId', err);
      return null;
    }
  }

  static async setGivenUserId(username) {
    try {
      let userId = await Users.find({ username }, { _id: 1 }).lean();

      userId = userId.map((m) => m._id);
      await RedisClient.addSetValue('givenuserid', userId, TIME);
      return userId;
    } catch (err) {
      logError('error in setGivenUserId', err);
      return null;
    }
  }

  async getGivenCompanyId(username) {
    try {
      const data = await RedisClient.getAllSetValue('givencompanyid');

      if (data && data.length > 0) {
        return data;
      }

      const userId = await Cache.setGivenCompanyId(username);

      return userId;
    } catch (err) {
      logError('error in getGivenUserId', err);
      return null;
    }
  }

  static async setGivenCompanyId(username) {
    try {
      let userId = await Users.find({ username }, { _id: 1 }).lean();

      userId = userId.map((m) => m._id);
      await RedisClient.addSetValue('givencompanyid', userId, TIME);
      return userId;
    } catch (err) {
      logError('error in setGivenUserId', err);
      return null;
    }
  }

  // get aws personalize recommendations from the redis cache
  async getSuggestions(userId) {
    try {
      const data = await RedisClient.getAllSetValue(`suggestions_${userId}`);

      if (data && data.length > 0) {
        return data;
      }

      return null;
    } catch (err) {
      logError('error in getSuggestions', err);
      return null;
    }
  }

  // set aws personalize recommendations into the redis cache
  async setSuggestions(userId, suggestions, time = TIME) {
    try {
      await RedisClient.addSetValue(`suggestions_${userId}`, suggestions, time);

      return true;
    } catch (err) {
      logError('error in setSuggestions', err);
      return null;
    }
  }
}

export default new Cache();
