'use strict';

const deviceRepository = require('../repositories/device.repository');
const { logger } = require('../utils/logger');
const { env } = require('../config');

/**
 * Development provider: logs that a notification would be sent, never the push token
 * or the device list. Replace with an FCM/APNs provider in a deployed environment.
 */
const logProvider = {
  async send(devices, message) {
    logger.info(
      { deviceCount: devices.length, platforms: [...new Set(devices.map((d) => d.platform))], title: message.title },
      'Push notification dispatched (log provider)',
    );
  },
};

/** Provider that drops every notification (tests, or push disabled). */
const noneProvider = { async send() {} };

let provider = env.PUSH_PROVIDER === 'log' ? logProvider : noneProvider;

/**
 * Replaces the delivery provider (used by tests or to plug in FCM/APNs).
 *
 * @param {{send: (devices: Array<{pushToken: string, platform: string}>, message: object) => Promise<void>}} next
 */
function setProvider(next) {
  provider = next;
}

/** Registers a device for the user. The token is stored, but never logged or returned. */
function registerDevice(userId, { pushToken, platform }) {
  return deviceRepository.upsert(userId, pushToken, platform);
}

/** Unregisters one of the user's devices. */
async function unregisterDevice(userId, pushToken) {
  await deviceRepository.removeOwned(userId, pushToken);
}

/** Lists the user's devices without push tokens. */
function listDevices(userId) {
  return deviceRepository.listPublicForUser(userId);
}

/**
 * Sends a notification to all of a user's devices without blocking the caller.
 * Message text must not contain secrets or personal data beyond what the user owns.
 *
 * @param {string} userId - Recipient.
 * @param {{title: string, body: string}} message - Notification content.
 * @returns {Promise<void>} Resolves after the attempt; failures are logged, not thrown.
 */
async function notifyUser(userId, message) {
  try {
    const devices = await deviceRepository.listTokensForUser(userId);
    if (devices.length > 0) await provider.send(devices, message);
  } catch (error) {
    // Error objects from providers can embed tokens, so only the message class is logged.
    logger.warn({ errName: error?.name }, 'Push notification failed');
  }
}

module.exports = { setProvider, registerDevice, unregisterDevice, listDevices, notifyUser };
