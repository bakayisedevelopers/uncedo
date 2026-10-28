'use strict';

const DEFAULT_MAX_TOOL_CALLS = 4;

function callKey(toolName, args = {}) {
  return `${String(toolName || '').trim()}:${JSON.stringify(args || {})}`;
}

/**
 * Runs one WhatsApp assistant turn as a bounded model/tool loop. Tool results
 * are fed back to the model on the next pass; authorization remains the
 * registry's responsibility and every operation is executed by trusted code.
 */
async function runWhatsAppAgentLoop({
  model,
  input = {},
  buildInput,
  chooseTool,
  executeTool,
  beforeTool,
  afterTool,
  maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
} = {}) {
  if (!model || typeof model.classify !== 'function') throw new TypeError('A WhatsApp model is required.');
  if (typeof executeTool !== 'function') throw new TypeError('A trusted tool executor is required.');
  const limit = Number.isInteger(maxToolCalls) ? Math.max(1, Math.min(8, maxToolCalls)) : DEFAULT_MAX_TOOL_CALLS;
  const toolResults = [];
  const seenCalls = new Set();
  let toolCallCount = 0;
  let previousPlan = null;

  while (true) {
    const modelInput = typeof buildInput === 'function'
      ? buildInput({ input, toolResults, previousPlan })
      : { ...input, toolResults };
    const plan = await model.classify(modelInput);
    previousPlan = plan;
    const forcedTool = typeof chooseTool === 'function'
      ? await chooseTool({ plan, toolResults, toolCallCount })
      : null;
    const toolName = String(forcedTool?.toolName || plan?.toolName || '').trim();
    if (!toolName) return { status: 'complete', final: plan, toolResults, toolCallCount };

    const args = forcedTool?.toolArguments || plan?.toolArguments || {};
    const key = callKey(toolName, args);
    if (seenCalls.has(key)) {
      return { status: 'repeated-tool-call', final: plan, toolResults, toolCallCount, blockedToolName: toolName };
    }
    if (toolCallCount >= limit) {
      return { status: 'tool-limit', final: plan, toolResults, toolCallCount, blockedToolName: toolName };
    }
    seenCalls.add(key);
    toolCallCount += 1;
    const call = { index: toolCallCount, toolName, toolArguments: args };
    if (typeof beforeTool === 'function') {
      try {
        await beforeTool(call);
      } catch (error) {
        const errorCode = String(error?.code || 'tool-preflight-failed').slice(0, 100);
        if (errorCode === 'stale') return { status: 'superseded', final: plan, toolResults, toolCallCount };
        if (errorCode === 'tool-rate-limited') return { status: 'rate-limited', final: plan, toolResults, toolCallCount };
        toolResults.push({ ...call, result: null, errorCode });
        return { status: 'tool-preflight-failed', final: plan, toolResults, toolCallCount };
      }
    }

    let result = null;
    let errorCode = '';
    try {
      result = await executeTool(toolName, args, call);
      if (result?.code === 'stale') {
        toolResults.push({ ...call, result, errorCode: '' });
        if (typeof afterTool === 'function') await afterTool({ ...call, result, errorCode: '' });
        return { status: 'superseded', final: plan, toolResults, toolCallCount };
      }
    } catch (error) {
      errorCode = String(error?.code || 'tool-failed').slice(0, 100);
    }

    const observation = { ...call, result, errorCode };
    toolResults.push(observation);
    if (typeof afterTool === 'function') await afterTool(observation);
    if (errorCode === 'stale') return { status: 'superseded', final: plan, toolResults, toolCallCount };
    if (toolName === 'requestHumanSupport' && result?.code === 'handed_off') {
      return { status: 'handoff', final: plan, toolResults, toolCallCount };
    }
  }
}

module.exports = { DEFAULT_MAX_TOOL_CALLS, runWhatsAppAgentLoop };
