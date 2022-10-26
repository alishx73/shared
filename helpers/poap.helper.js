import axios from 'axios';
import https from 'https';

const { POAP_API_TOKEN, DEBANK_RATE_LIMIT_MINS } = process.env;

const poapBaseUrl = `https://api.poap.tech`;

const axiosRequest = axios.create({
  headers: {
    'X-API-Key': POAP_API_TOKEN,
    'Content-Type': 'application/json',
  },
  httpsAgent: new https.Agent({ keepAlive: true }),
});

/**
 *
 * @param {string} _address
 * @returns {array}
 */
export const fetchTokenBals = (_address) => {
  const route = `${poapBaseUrl}/actions/scan/${_address}`;

  return axiosRequest.get(route, {});
};

/**
 *
 * @param {number || string} _tokenId
 * @returns {axios response data}
 */
export const fetchEachTokenInfo = async (_tokenId) => {
  const route = `${poapBaseUrl}/token/${_tokenId}`;
  const tokenData = await axiosRequest.get(route, {});

  return tokenData;
};

/**
 *
 * @param {string} date
 * @returns {boolean}
 */
export const fetchFromPoapOrNot = (date) => {
  const currentDate = new Date();
  const dateFromDatabase = new Date(date);

  return currentDate - dateFromDatabase > DEBANK_RATE_LIMIT_MINS * 60 * 1000;
};

/**
 * for formatting data to required format
 * @param {Object or Array} originalFormatData
 * @returns {Object or Array}
 */

export const dataFormatter = async (originalFormatData, type, address) => {
  let modifiedData = [];

  // based on type of data formatting data to required format
  if (type === 'allNfts') {
    modifiedData = [];

    // eslint-disable-next-line
    for (const nft of originalFormatData) {
      const data = {
        address,
        id: nft.event.fancy_id,
        name: nft.event.name,
        description: nft.event.description,
        chain: nft.chain,
        contractAddress: '0x22c1f6050e56d2876009903609a2cc3fef83b415',
        contractName: 'POAP',
        tokenId: nft.tokenId,
        collectionId: nft.event.id,
        totalSupply: null,
        orderSupply: null,
        isErc721: false,
        isErc1155: true,
        type: 'poap',
        metadata: {
          thumbnailUrl: nft.event.image_url,
          detailUrl: `https://app.poap.xyz/token/${nft.tokenId}`, // homeURL of meta
          attributes: [
            {
              traitType: 'year',
              value: nft.event.year,
            },
            {
              traitType: 'start_date',
              value: nft.event.start_date,
            },
            {
              traitType: 'end_date',
              value: nft.event.end_date,
            },
            {
              traitType: 'expiry_date',
              value: nft.event.expiry_date,
            },
            {
              traitType: 'country',
              value: nft.event.country,
            },
            {
              traitType: 'city',
              value: nft.event.city,
            },
          ],
        },
      };

      modifiedData.push(data);
    }
  }

  return modifiedData;
};
