import axios from 'axios';
import https from 'https';
import {
  UsersTokens,
  UserTransactions,
  UserTransactionsSyncInfo,
  UserContractAddresses,
} from '../database/db-models';

const { DEBANK_API_TOKEN, DEBANK_RATE_LIMIT_MINS } = process.env;

const debankBaseUrl = `https://pro-openapi.debank.com`;
const chainBalsUrl = 'v1/user/total_balance';
const tokenBalsUrl = 'v1/user/all_token_list';
const supportedChainBalsUrl = '/v1/chain/list';
const transactionsListUrl = 'v1/user/all_history_list';
const transactionsListUrlWithFilter = 'v1/user/history_list';
const allNftsListUrl = 'v1/user/all_nft_list';
const protocolBalsUrl = 'v1/user/all_simple_protocol_list';
const protocolListUrl = 'v1/user/all_complex_protocol_list';
const tokenInfoUrl = 'v1/token';

const axiosRequest = axios.create({
  headers: {
    AccessKey: DEBANK_API_TOKEN,
    'Content-Type': 'application/json',
  },
  httpsAgent: new https.Agent({ keepAlive: true }),
});

/**
 *
 * @param {string} id
 * @returns {Object}
 */
export const fetchChainBals = (id) => {
  const route = `${debankBaseUrl}/${chainBalsUrl}?id=${id}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} id
 * @returns {array}
 */
export const fetchTokenBals = (id) => {
  const route = `${debankBaseUrl}/${tokenBalsUrl}?id=${id}&is_all=true`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} id
 * @returns {array}
 */
export const fetchProtocolBals = (id) => {
  const route = `${debankBaseUrl}/${protocolBalsUrl}?id=${id}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} id
 * @returns {array}
 */
export const fetchProtocolList = (id) => {
  const route = `${debankBaseUrl}/${protocolListUrl}?id=${id}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} id
 * @returns {array}
 */
export const fetchNftList = (id) => {
  const route = `${debankBaseUrl}/${allNftsListUrl}?id=${id}&is_all=true`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} chain
 * @param {string} tokenId
 * @returns {array}
 */
export const fetchToken = (chain, tokenId) => {
  const route = `${debankBaseUrl}/${tokenInfoUrl}?chain_id=${chain}&id=${tokenId}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {string} date
 * @returns {boolean}
 */
export const fetchFromDebankOrNot = (date) => {
  const currentDate = new Date();
  const dateFromDatabase = new Date(date);

  return currentDate - dateFromDatabase > DEBANK_RATE_LIMIT_MINS * 60 * 1000;
};

/**
 *
 * @param {Object} tokenBalsData
 * @returns {double}
 */
export const sumOfAllTokenBals = (tokenBalsData) => {
  const totalBal = tokenBalsData.reduce(
    (previousValue, currentValue) =>
      previousValue +
      parseFloat(currentValue.amount.toString()) *
        parseFloat(currentValue.price.toString()),
    0,
  );

  return totalBal;
};

/**
 *
 * @param null
 * @returns {Array}
 */
export const fetchSupportedChains = () => {
  const route = `${debankBaseUrl}/${supportedChainBalsUrl}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {String} address
 * @param {Number} date
 * @returns {Array}
 */
export const fetchTransactions = (
  address,
  date,
  limit,
  filterType,
  chain,
  tokenId,
) => {
  if (filterType === 'all_chain') {
    const route = `${debankBaseUrl}/${transactionsListUrl}?id=${address}&start_time=${date}&page_count=${limit}`;

    return axiosRequest.get(route, {});
  }

  if (tokenId === '') {
    const route = `${debankBaseUrl}/${transactionsListUrlWithFilter}?id=${address}&start_time=${date}&page_count=${limit}&chain_id=${chain}`;

    return axiosRequest.get(route, {});
  }

  const route = `${debankBaseUrl}/${transactionsListUrlWithFilter}?id=${address}&start_time=${date}&page_count=${limit}&chain_id=${chain}&token_id=${tokenId}`;

  return axiosRequest.get(route, {});
};

/**
 * for formatting data to required format
 * @param {Object or Array} originalFormatData
 * @returns {Object or Array}
 */

export const dataFormatter = async (originalFormatData, type, address) => {
  let modifiedData;

  // based on type of data formatting data to required format
  if (type === 'chainBals') {
    modifiedData = {};
    modifiedData.address = address;
    modifiedData.totalUsdVal = originalFormatData.total_usd_value;
    modifiedData.chainList = [];

    // sorting based on usd value holding of user
    originalFormatData.chain_list.sort((a, b) =>
      a.usd_value < b.usd_value ? 1 : -1,
    );

    // eslint-disable-next-line
    for (const eachChainBals of originalFormatData.chain_list) {
      modifiedData.chainList.push({
        id: eachChainBals.id,
        communityId: eachChainBals.community_id,
        name: eachChainBals.name,
        nativeTokenId: eachChainBals.native_token_id,
        logoUrl: eachChainBals.logo_url ? eachChainBals.logo_url : '',
        wrappedTokenId: eachChainBals.wrapped_token_id
          ? eachChainBals.wrapped_token_id
          : '',
        usdValue: eachChainBals.usd_value,
      });
    }
  } else if (type === 'tokenBals') {
    modifiedData = {};
    modifiedData.address = address;
    modifiedData.tokenList = [];

    // eslint-disable-next-line
    for (const eachTokenBals of originalFormatData) {
      if (eachTokenBals.is_verified && eachTokenBals.is_wallet) {
        modifiedData.tokenList.push({
          contractAddress: eachTokenBals.id,
          chain: eachTokenBals.chain,
          name: eachTokenBals.name,
          symbol: eachTokenBals.symbol,
          logoUrl: eachTokenBals.logo_url ? eachTokenBals.logo_url : '',
          price: eachTokenBals.price,
          amount: eachTokenBals.amount,
          timeAt: eachTokenBals.time_at,
          displaySymbol: eachTokenBals.display_symbol
            ? eachTokenBals.display_symbol
            : '',
          protocolId: eachTokenBals.protocol_id
            ? eachTokenBals.protocol_id
            : '',
          isVerified: true,
          value: eachTokenBals.price * eachTokenBals.amount,
        });
      }
    }

    // sorting based on value at the end reduce sorting length as well and usage of one extra map
    modifiedData.tokenList.sort((a, b) => (a.value < b.value ? 1 : -1));
  } else if (type === 'supported_chains') {
    modifiedData = {};
    modifiedData.chainList = [];

    // eslint-disable-next-line
    for (const eachChainBals of originalFormatData) {
      modifiedData.chainList.push({
        id: eachChainBals.id,
        communityId: eachChainBals.community_id,
        name: eachChainBals.name,
        nativeTokenId: eachChainBals.native_token_id,
        logoUrl: eachChainBals.logo_url ? eachChainBals.logo_url : '',
        wrappedTokenId: eachChainBals.wrapped_token_id
          ? eachChainBals.wrapped_token_id
          : '',
        isSupportBalanceChange: eachChainBals.is_support_balance_change,
      });
    }
  } else if (type === 'transactions_list') {
    modifiedData = [];

    // eslint-disable-next-line
    for (const eachTransaction of originalFormatData.history_list) {
      const receiveArray = [];
      const sendsArray = [];

      // eslint-disable-next-line
      for (const eachReceive of eachTransaction.receives) {
        const tokenInfo = originalFormatData.token_dict[eachReceive.token_id];
        const amountInfo = tokenInfo
          ? {
              symbol: tokenInfo.symbol,
              logoUrl: tokenInfo.logo_url ? tokenInfo.logo_url : '',
              name: tokenInfo.name,
            }
          : {
              symbol: 'NFT',
              logoUrl:
                'https://assets.debank.com/static/media/nft.e0322c7c.svg',
              name: 'Unknown',
            };

        receiveArray.push({
          amount: eachReceive.amount,
          fromAddr: eachReceive.from_addr,
          amountInfo,
          tokenId: eachReceive.token_id,
        });
      }

      // eslint-disable-next-line
      for (const eachSends of eachTransaction.sends) {
        const tokenInfo = originalFormatData.token_dict[eachSends.token_id];
        const amountInfo = tokenInfo
          ? {
              symbol: tokenInfo.symbol,
              logoUrl: tokenInfo.logo_url ? tokenInfo.logo_url : '',
              name: tokenInfo.name,
            }
          : {
              symbol: 'NFT',
              logoUrl:
                'https://assets.debank.com/static/media/nft.e0322c7c.svg',
              name: 'Unknown',
            };

        sendsArray.push({
          amount: eachSends.amount,
          toAddr: eachSends.to_addr,
          amountInfo,
          tokenId: eachSends.token_id,
        });
      }
      modifiedData.push({
        address,
        cateId: eachTransaction.cate_id ? eachTransaction.cate_id : null,
        chain: eachTransaction.chain,
        transactionId: eachTransaction.id,
        otherAddr: eachTransaction.other_addr ? eachTransaction.other_addr : '',
        projectId: eachTransaction.project_id ? eachTransaction.project_id : '',

        // eslint-disable-next-line
        projectName: eachTransaction.project_id
          ? originalFormatData.project_dict[eachTransaction.project_id]
            ? originalFormatData.project_dict[eachTransaction.project_id].name
            : ''
          : '',
        // eslint-disable-next-line no-nested-ternary
        projectUrl: eachTransaction.project_id
          ? // eslint-disable-next-line no-nested-ternary
            originalFormatData.project_dict[eachTransaction.project_id]
            ? originalFormatData.project_dict[eachTransaction.project_id]
                .logo_url
              ? originalFormatData.project_dict[eachTransaction.project_id]
                  .logo_url
              : ''
            : ''
          : '',
        timeAt: eachTransaction.time_at,
        transactionInfo: eachTransaction.tx
          ? {
              gasFee: eachTransaction.tx.eth_gas_fee,
              fromAddr: eachTransaction.tx.from_addr
                ? eachTransaction.tx.from_addr
                : '',
              name: eachTransaction.tx.name,
              toAddr: eachTransaction.tx.to_addr
                ? eachTransaction.tx.to_addr
                : '',
              usdGasFee: eachTransaction.tx.usd_gas_fee,
              transactionStatus: eachTransaction.tx.status,
            }
          : null,
        sends: sendsArray,
        receives: receiveArray,
      });
    }
  } else if (type === 'allNfts') {
    modifiedData = [];
    const contractAddressesObj = await UserContractAddresses.find({
      isWhiteListed: true,
    }).lean();

    // eslint-disable-next-line
    const contractAddresses = contractAddressesObj.map((c) =>
      c.contractAddress.toLowerCase(),
    );

    // eslint-disable-next-line
    for (const nft of originalFormatData) {
      const data = {
        address,
        id: nft.id,
        name: nft.name,
        description: nft.description,
        chain: nft.chain,
        contractAddress: nft.contract_id,
        contractName: nft.contract_name,
        tokenId: nft.inner_id,
        collectionId: nft.collection_id,
        amount: nft.amount,
        usdPrice: nft.usd_price,
        totalSupply: nft.total_supply,
        isErc721: nft.is_erc721,
        isErc1155: nft.is_erc1155,
        type: 'debank',
        payToken: {
          id: nft.pay_token?.id,
          chain: nft.pay_token?.chain,
          name: nft.pay_token?.name,
          symbol: nft.pay_token?.symbol,
          displaySymbol: nft.pay_token?.display_symbol,
          optimizedSymbol: nft.pay_token?.optimized_symbol,
          decimals: nft.pay_token?.decimals,
          logoUrl: nft.pay_token?.logo_url,
          protocolId: nft.pay_token?.protocol_id,
          price: nft.pay_token?.price,
          isVerified: nft.pay_token?.is_verified,
          isCore: nft.pay_token?.is_core,
          isWallet: nft.pay_token?.is_wallet,
          timeAt: nft.pay_token?.time_at,
          amount: nft.pay_token?.amount,
          dateAt: nft.pay_token?.date_at,
        },
        metadata: {
          contentType: nft.content_type,
          content: nft.content,
          thumbnailUrl: nft.thumbnail_url,
          detailUrl: nft.detail_url,
        },
      };

      modifiedData.push(data);
    }
  } else if (type === 'tokenInfo') {
    modifiedData = {
      chainId: originalFormatData.chain,
      tokenId: originalFormatData.id,
      tokenName: originalFormatData.name,
      tokenSymbol: originalFormatData.symbol,
      tokenLogoUrl: originalFormatData.logo_url
        ? originalFormatData.logo_url
        : '',
    };
  } else if (type === 'protocolBals') {
    modifiedData = {};
    modifiedData.address = address;
    modifiedData.protocolList = [];

    // eslint-disable-next-line
    for (const eachProtocolBals of originalFormatData) {
      modifiedData.protocolList.push({
        protocolId: eachProtocolBals.id,
        chain: eachProtocolBals.chain,
        name: eachProtocolBals.name,
        logoUrl: eachProtocolBals.logo_url ? eachProtocolBals.logo_url : '',
        siteUrl: eachProtocolBals.site_url ? eachProtocolBals.site_url : '',
        balance: eachProtocolBals.net_usd_value,
      });
    }
  } else if (type === 'protocolsList') {
    modifiedData = {};
    modifiedData.address = address;
    modifiedData.protocolList = [];

    // eslint-disable-next-line
    for (const eachProtocol of originalFormatData) {
      const portfolioItemList = [];

      // eslint-disable-next-line
      for (const eachPortfolioItem of eachProtocol.portfolio_item_list) {
        const detailInfo = {};

        if (eachPortfolioItem.detail.supply_token_list) {
          detailInfo.supplyTokenList = [];
          const supplyTokenList = [];

          // eslint-disable-next-line
          for (const eachSupplyToken of eachPortfolioItem.detail
            ?.supply_token_list) {
            supplyTokenList.push({
              symbol: eachSupplyToken.optimized_symbol,
              logoUrl: eachSupplyToken.logo_url ? eachSupplyToken.logo_url : '',
              amount: eachSupplyToken.amount,
              price: eachSupplyToken.price,
            });
          }
          detailInfo.supplyTokenList = supplyTokenList;
        }

        if (eachPortfolioItem.detail.reward_token_list) {
          detailInfo.rewardTokenList = [];
          const rewardTokenList = [];

          // eslint-disable-next-line
          for (const eachRewardToken of eachPortfolioItem.detail
            ?.reward_token_list) {
            rewardTokenList.push({
              symbol: eachRewardToken.optimized_symbol,
              logoUrl: eachRewardToken.logo_url ? eachRewardToken.logo_url : '',
              amount: eachRewardToken.amount,
              price: eachRewardToken.price,
            });
          }

          detailInfo.rewardTokenList = rewardTokenList;
        }

        if (eachPortfolioItem.detail.borrow_token_list) {
          detailInfo.borrowTokenList = [];
          const borrowTokenList = [];

          // eslint-disable-next-line
          for (const eachBorrowToken of eachPortfolioItem.detail
            ?.borrow_token_list) {
            borrowTokenList.push({
              symbol: eachBorrowToken.optimized_symbol,
              logoUrl: eachBorrowToken.logo_url ? eachBorrowToken.logo_url : '',
              amount: eachBorrowToken.amount,
              price: eachBorrowToken.price,
            });
          }

          detailInfo.borrowedTokenList = borrowTokenList;
        }

        if (eachPortfolioItem.name === 'Perpetuals') {
          detailInfo.perpetualInfo = {};
          detailInfo.perpetualInfo = {
            side: eachPortfolioItem.detail?.side,
            entryPrice: eachPortfolioItem.detail?.entry_price,
            markPrice: eachPortfolioItem.detail?.mark_price,
            liquidationPrice: eachPortfolioItem.detail?.liquidation_price,
            position: {
              amount: eachPortfolioItem.detail?.position_token?.amount,
              symbol: eachPortfolioItem.detail?.position_token?.symbol,
              logoUrl: eachPortfolioItem.detail?.position_token?.logo_url,
            },
            margin: {
              amount: eachPortfolioItem.detail?.margin_token?.amount,
              symbol: eachPortfolioItem.detail?.margin_token?.symbol,
              logoUrl: eachPortfolioItem.detail?.margin_token?.logo_url,
            },
            marginRate: eachPortfolioItem.detail?.margin_rate,
            leverage: eachPortfolioItem.detail?.leverage,
            funding: eachPortfolioItem.detail?.daily_funding_rate,
          };
        }

        if (eachPortfolioItem.detail?.unlock_at) {
          detailInfo.unlockTime = eachPortfolioItem.detail?.unlock_at;
        }

        if (eachPortfolioItem.detail?.description) {
          detailInfo.description = eachPortfolioItem.detail?.description;
        }

        if (eachPortfolioItem.detail?.debt_ratio) {
          detailInfo.debtRatio = eachPortfolioItem.detail?.debt_ratio;
        }

        if (
          eachPortfolioItem.name === 'Lending' &&
          eachPortfolioItem.detail?.health_rate
        ) {
          detailInfo.healthRate = eachPortfolioItem.detail?.health_rate;
        }

        if (eachPortfolioItem.detail?.claimable_amount) {
          detailInfo.claimableAmount =
            eachPortfolioItem.detail?.claimable_amount;
        }

        if (eachPortfolioItem.detail?.end_at) {
          detailInfo.endAt = eachPortfolioItem.detail?.end_at;
        }

        if (eachPortfolioItem.detail?.daily_unlock_amount) {
          detailInfo.dailyUnlockAmount =
            eachPortfolioItem.detail?.daily_unlock_amount;
        }

        if (eachPortfolioItem.name === 'Vesting') {
          detailInfo.vestingInfo = {};
          detailInfo.vestingInfo = {
            amount: eachPortfolioItem.detail?.token?.amount,
            symbol: eachPortfolioItem.detail?.token?.symbol,
            logoUrl: eachPortfolioItem.detail?.token?.logo_url,
            endTime: eachPortfolioItem.detail?.token?.end_at,
          };
        }

        if (eachPortfolioItem.name === 'Options Buyer') {
          detailInfo.optionsBuyer = {};
          detailInfo.optionsBuyer = {
            type: eachPortfolioItem.detail?.type,
            style: eachPortfolioItem.detail?.style,
            expirationStartsAt: eachPortfolioItem.detail?.exercise_start_at,
            expirationEndsAt: eachPortfolioItem.detail?.exercise_end_at,
            expirationProfit: eachPortfolioItem.detail?.exercise_profit,
            underlyingInfo: {
              symbol:
                eachPortfolioItem.detail?.underlying_token?.optimized_symbol,
              logoUrl: eachPortfolioItem.detail?.underlying_token?.logo_url,
              amount: eachPortfolioItem.detail?.underlying_token?.amount,
              name: eachPortfolioItem.detail?.underlying_token?.name,
            },
            strikeInfo: {
              symbol: eachPortfolioItem.detail?.strike_token?.optimized_symbol,
              logoUrl: eachPortfolioItem.detail?.strike_token?.logo_url,
              amount: eachPortfolioItem.detail?.strike_token?.amount,
              name: eachPortfolioItem.detail?.strike_token?.name,
            },
          };
        }

        portfolioItemList.push({
          usdValue: eachPortfolioItem.stats?.net_usd_value,
          labelName: eachPortfolioItem.name,
          detail: detailInfo,
        });
      }
      modifiedData.protocolList.push({
        protocolId: eachProtocol.id,
        chain: eachProtocol.chain,
        name: eachProtocol.name,
        logoUrl: eachProtocol.logo_url ? eachProtocol.logo_url : '',
        siteUrl: eachProtocol.site_url ? eachProtocol.site_url : '',
        portfolioItemList,
      });
    }
  }

  return modifiedData;
};

/**
 * fetching from debank and updating records in local database and updating sync info as well
 * @param {Number} recentTransactionDate //date from where records to be fetched
 * @param {String} filterType //all_chain or filter
 * @param {String} chain //chainName if any
 * @param {String} tokenId //tokenId if any
 * @param {Number} startRecordTime //first record fetched time
 * @param {Number} endRecordTime //last record fetched Time
 * @returns {Array}
 */

export const fetchFromDebankAndUpdateRecordsAndSyncInfo = async (
  address,
  recentTransactionDate,
  limit,
  filterType,
  chain,
  tokenId,
  startRecordTime,
  endRecordTime,
  syncInfo,
) => {
  const date = recentTransactionDate
    ? +new Date(recentTransactionDate)
    : +new Date();

  const { data } = await fetchTransactions(
    address,
    date,
    limit,
    filterType,
    chain,
    tokenId,
  );

  const transactionsModifiedList = await dataFormatter(
    data,
    'transactions_list',
    address,
  );

  // eslint-disable-next-line
  const bulk_ops_arr = [];

  // eslint-disable-next-line
  for (const eachTransaction of transactionsModifiedList) {
    const transaction = { ...eachTransaction };

    // eslint-disable-next-line
    const update_op = {
      updateOne: {
        filter: { transactionId: transaction.transactionId },
        update: transaction,
        upsert: true,
        new: true,
      },
    };

    bulk_ops_arr.push(update_op);
  }

  await UserTransactions.bulkWrite(bulk_ops_arr);

  // without any transactions there is nothing to sync it's just a edge case when api was hit with wrong values
  if (transactionsModifiedList.length >= 1) {
    if (filterType === 'all_chain') {
      // if no filter applied
      const allChainTransInfo = {};

      if (syncInfo) {
        if (startRecordTime) {
          allChainTransInfo.startRecordTime =
            transactionsModifiedList[0].timeAt;
        } else {
          allChainTransInfo.startRecordTime =
            syncInfo.allChainTransInfo?.startRecordTime;
        }

        if (endRecordTime) {
          allChainTransInfo.endRecordTime =
            transactionsModifiedList[
              transactionsModifiedList.length - 1
            ].timeAt;
        } else {
          allChainTransInfo.endRecordTime =
            syncInfo.allChainTransInfo?.endRecordTime;
        }

        await UserTransactionsSyncInfo.findOneAndUpdate(
          {
            address,
          },
          { address, allChainTransInfo },
          {
            upsert: true,
            new: true,
          },
        );
      } else {
        if (startRecordTime) {
          allChainTransInfo.startRecordTime =
            transactionsModifiedList[0].timeAt;
        }

        if (endRecordTime) {
          allChainTransInfo.endRecordTime =
            transactionsModifiedList[
              transactionsModifiedList.length - 1
            ].timeAt;
        }

        await UserTransactionsSyncInfo.findOneAndUpdate(
          {
            address,
          },
          { address, allChainTransInfo },
          {
            upsert: true,
            new: true,
          },
        );
      }
    } else {
      // if any filter applied

      // eslint-disable-next-line
      await updateSyncInfoWithFilter(
        address,
        chain,
        tokenId,
        startRecordTime ? transactionsModifiedList[0].timeAt : 0,
        endRecordTime
          ? transactionsModifiedList[transactionsModifiedList.length - 1].timeAt
          : 0,
        syncInfo,
      );
    }
  }

  return transactionsModifiedList;
};

/**
 * to update sync info
 * @param {String} chain //chainName if any
 * @param {String} tokenId //tokenId if any
 * @param {Number} startRecordTime //first record fetched time
 * @param {Number} endRecordTime //last record fetched Time
 * @returns {Object}
 */

export const updateSyncInfoWithFilter = async (
  address,
  chain,
  tokenId,
  startRecordTime,
  endRecordTime,
  syncInfo,
) => {
  if (syncInfo) {
    const updateInfo = {};

    if (startRecordTime) {
      updateInfo['filterdTransInfo.$.startRecordTime'] = startRecordTime;
    }

    if (endRecordTime) {
      updateInfo['filterdTransInfo.$.endRecordTime'] = endRecordTime;
    }

    const matched = syncInfo.filterdTransInfo.filter(
      (filterdTransInfo) =>
        filterdTransInfo.chainId === chain &&
        filterdTransInfo.tokenId === tokenId,
    );

    await UserTransactionsSyncInfo.updateOne(
      {
        address,
        'filterdTransInfo._id': matched[0]._id,
      },
      {
        $set: updateInfo,
      },
    );
  } else {
    const filterdTransInfo = {};

    if (startRecordTime) {
      filterdTransInfo.startRecordTime = startRecordTime;
    }

    if (endRecordTime) {
      filterdTransInfo.endRecordTime = endRecordTime;
    }

    if (chain) {
      filterdTransInfo.chainId = chain;
      filterdTransInfo.tokenId = '';
    }

    if (tokenId) {
      filterdTransInfo.tokenId = tokenId;
    }

    await UserTransactionsSyncInfo.findOneAndUpdate(
      {
        address,
      },
      {
        address,
        $push: {
          filterdTransInfo,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );
  }
};

/**
 * To update tokens list collection in the background
 * @param {Object} dataFromDebankModified //data of token bals list of user
 * @returns null
 */

export const updateTokenListInBackground = (dataFromDebankModified) => {
  // eslint-disable-next-line
  const bulk_ops_arr = [];

  // pushing each token bals to bulkwrite array using update to avoid error while writing existed records
  // eslint-disable-next-line
  for (const eachTokenBals of dataFromDebankModified.tokenList) {
    const tokenBals = { ...eachTokenBals };
    // eslint-disable-next-line
    const update_op = {
      updateOne: {
        filter: {
          chainId: tokenBals.chain,
          tokenId: tokenBals.contractAddress,
        },
        update: {
          chainId: eachTokenBals.chain,
          tokenId: eachTokenBals.contractAddress,
          tokenName: eachTokenBals.name,
          tokenSymbol: eachTokenBals.symbol,
          tokenLogoUrl: eachTokenBals.logoUrl ? eachTokenBals.logoUrl : '',
        },
        upsert: true,
        new: true,
      },
    };

    bulk_ops_arr.push(update_op);
  }

  UsersTokens.bulkWrite(bulk_ops_arr);
};
