import axios from 'axios';
import qs from 'qs';
import { Types } from 'mongoose';
import { Notifications, Users } from '../database/db-models';
import { logError, logInfo } from './logger.helper';

class NotificationRevert {
  constructor(action, actorUser, reciver, remarks) {
    this.action = action;
    this.actorUser = actorUser;
    this.reciver = reciver;
    this.token = remarks?.token || null;
  }

  async handle() {
    try {
      switch (this.action) {
        case 'unfollow': {
          logInfo('Deleting follow Notifications', this.actorUser.username);
          const notis = await Notifications.findOne({
            uid: Types.ObjectId(this.reciver._id),
            actorIdArr: this.actorUser._id,
            action: 'follow',
            isActive: true,
          });

          this.reduceEvent(notis);
          if (notis) {
            if (notis.contributor_count === 1) {
              await notis.remove();
              break;
            }

            const index = notis.actorIdArr.indexOf(this.actorUser._id);

            notis.actorIdArr.splice(index, 1);

            const contributorIndex = notis.contributor.indexOf(
              this.actorUser._id,
            );

            if (contributorIndex >= 0) {
              notis.contributor.splice(contributorIndex, 1);
              const actorIdArrLength = notis.actorIdArr.length;

              if (actorIdArrLength >= 2) {
                let lastUserId;

                if (
                  notis.actorIdArr[actorIdArrLength - 1] ===
                  notis.contributor[0]
                ) {
                  lastUserId = notis.actorIdArr[actorIdArrLength - 2];
                } else {
                  lastUserId = notis.actorIdArr[actorIdArrLength - 1];
                }

                notis.contributor.push(lastUserId);
              }
            }

            notis.contributor_count -= 1;
            await notis.save();
          }

          break;
        }

        default:
          break;
      }
      return true;
    } catch (e) {
      logError('issue in reverting notification');
      return false;
    }
  }

  async reduceEvent(noti) {
    try {
      const notiCreatedAt = noti.createdAt;

      const receiver = await Users.findOne(
        { _id: noti.uid },
        { notification_count: 1, lastNotificationAccessTime: 1 },
      );

      if (receiver.lastNotificationAccessTime < notiCreatedAt) {
        receiver.notification_count -= 1;
        await receiver.save();
        const data = {
          event: noti.action,
          message: 'success',
          user: this.actorUser,
          isReduce: true,
          data: {
            to: receiver._id,
            notification_count: receiver.notification_count,
          },
        };

        const payload = qs.stringify({ data: JSON.stringify(data) });
        const headers = {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'x-access-token': this.token,
        };

        const config = {
          method: 'POST',
          url: `${process.env.SOCKET_URL}emit`,
          headers,
          data: payload,
        };

        axios(config)
          .then((response) => {
            if (!response) {
              return logError('noti.revert::handle axios error.', {
                error: 'Socket error.',
              });
            }

            return logInfo('noti.revert::handle', {
              message: 'notification count reverted...',
            });
          })
          .catch((error) => {
            logError('noti.revert::handle axios error', error.stack);
          });
      }
    } catch (err) {
      logError('Reduce event had a problem');
    }
  }
}

export default NotificationRevert;
