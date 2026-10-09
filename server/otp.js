function extractOtp(text) {
  if (!text) return null;
  const patterns = [
    /(?:OTP|code|verification|PIN|PASS)\s*[:\-]?\s*(\d{4,8})/gi,
    /\b(\d{4,8})\b/g,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = match[0].match(/\d{4,8}/);
      if (digits) return digits[0];
    }
  }
  return null;
}

module.exports = { extractOtp };
