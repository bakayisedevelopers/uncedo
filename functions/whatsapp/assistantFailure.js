'use strict';

const AI_UNAVAILABLE_REPLY = 'Sorry, I could not process that message right now. Please try again shortly, or contact Uncedo through the app.';

function canSendAiUnavailableReply({ phase, toolExecutionStarted = false, outboundAttempted = false } = {}) {
  return phase === 'classification' && toolExecutionStarted !== true && outboundAttempted !== true;
}

async function attemptAiUnavailableReply({ phase, toolExecutionStarted = false, outboundAttempted = false, sendReply } = {}) {
  if (!canSendAiUnavailableReply({ phase, toolExecutionStarted, outboundAttempted }) || typeof sendReply !== 'function') {
    return { attempted: false, sent: false };
  }
  const result = await sendReply(AI_UNAVAILABLE_REPLY, null, 'assistant_failure_fallback');
  return { attempted: true, sent: result?.sent === true };
}

module.exports = { AI_UNAVAILABLE_REPLY, attemptAiUnavailableReply, canSendAiUnavailableReply };
