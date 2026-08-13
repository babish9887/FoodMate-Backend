const crypto = require('crypto');

/**
 * Generate HMAC SHA256 signature for eSewa payment request
 */
function generateEsewaSignature({ total_amount, transaction_uuid, product_code }) {
  const secretKey = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';
  const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}

/**
 * Verify eSewa callback payload signature
 * @param {Object} decodedData - Decoded base64 payload from eSewa
 * @returns {Boolean}
 */
function verifyEsewaSignature(decodedData) {
  if (!decodedData || !decodedData.signature) return false;

  const secretKey = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';
  const signedFields = decodedData.signed_field_names
    ? decodedData.signed_field_names.split(',')
    : ['transaction_code', 'status', 'total_amount', 'transaction_uuid', 'product_code', 'signed_field_names'];

  const message = signedFields
    .map((field) => `${field}=${decodedData[field] !== undefined ? decodedData[field] : ''}`)
    .join(',');

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  const expectedSignature = hmac.digest('base64');

  return expectedSignature === decodedData.signature;
}

module.exports = {
  generateEsewaSignature,
  verifyEsewaSignature,
};
