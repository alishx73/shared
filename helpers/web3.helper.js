import { recoverPersonalSignature } from '@metamask/eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';
import * as ethers from 'ethers';
import { SIGNATURE_MESSAGE, WEB3_ACTION } from '../enum/web3.enum';
// db modal imports lies here
import { PublicAddress } from '../database/db-models';

/**
 * Verify signature by comparing user public address
 * with recovered address from signature
 * @param {string} message
 * @param {string} signature
 * @param {string} publicAddress
 * @returns {boolean}
 */
export const verifySignature = (message, signature, publicAddress) => {
  const msgBufferHex = bufferToHex(Buffer.from(message, 'utf8'));
  const recoveredAddress = recoverPersonalSignature({
    data: msgBufferHex,
    signature,
  });

  return recoveredAddress.toLowerCase() === publicAddress.toLowerCase();
};

/**
 * Generate random nonce number
 * @returns {Number}
 */
export const generateRandomNonce = () => Math.floor(Math.random() * 10000);

/**
 * Get signature message based on Web3 action type
 * @param {String} type
 * @param {Object} userDetails
 * @param {String} userDetails.userNonce
 * @param {String} userDetails.userAddress
 * @returns {String}
 */
export const getSignatureMessage = (
  type = WEB3_ACTION.VERIFY_ADDRESS,
  { userNonce, userAddress },
) => {
  const signatureMessage = SIGNATURE_MESSAGE[type];

  if (!signatureMessage) {
    throw new Error(`Signature message ${type} not found`);
  }

  if (signatureMessage.requiredNonce && !userNonce) {
    throw new Error(`Signature message ${type} requires nonce`);
  }

  if (!userAddress) {
    throw new Error(`User public address is required`);
  }

  const messageHeader = 'Message:';
  const pleaseSignMessage = `Please sign to let us verify that you are the owner of this address ${userAddress}`;
  const nonceHeader = 'Nonce:';

  if (signatureMessage.requiredNonce) {
    return [
      messageHeader,
      signatureMessage.message,
      pleaseSignMessage,
      nonceHeader,
      userNonce,
    ].join('\n\r');
  }

  return [messageHeader, signatureMessage.message, pleaseSignMessage].join(
    '\n\r',
  );
};

export const verifyPublicAddress = async (req, res, next) => {
  try {
    const { address } = req.params;
    const userHasLinkedAddress = await PublicAddress.exists({
      userId: req.user.sub,
      publicAddress: address,
      isPublicAddressVerified: true,
    });

    if (userHasLinkedAddress) {
      return next();
    }

    throw new Error('Unauthorized User');
  } catch (e) {
    return res
      .status(401)
      .json({ success: false, message: 'Unauthorized User' });
  }
};

export const getEns = async (address) => {
  // eslint-disable-next-line
  try {
    const web3Provider = new ethers.providers.JsonRpcProvider(
      process.env.ETH_RPC_URL,
    );
    const ensName = await web3Provider.lookupAddress(address);

    return ensName && ensName !== '' ? ensName : '';
  } catch (err) {
    throw err;
  }
};
