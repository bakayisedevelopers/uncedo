'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runWhatsAppAgentLoop } = require('./agentLoop');

test('feeds each command result back to the model until it returns a final response', async () => {
  const seen = [];
  const plans = [
    { intent: 'service_booking', toolName: 'listAvailableServices', toolArguments: {} },
    { intent: 'service_booking', toolName: 'getServiceQuestionnaire', toolArguments: { serviceId: 'wash' } },
    { intent: 'service_booking', toolName: '', assistantResponse: 'I found the wash service. What vehicle should I use?' },
  ];
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async (input) => { seen.push(input.toolResults.length); return plans.shift(); } },
    executeTool: async (name) => name === 'listAvailableServices'
      ? { services: [{ id: 'wash', label: 'Car wash' }] }
      : { serviceId: 'wash', questions: [{ id: 'vehicle', prompt: 'Vehicle?' }] },
  });

  assert.equal(outcome.status, 'complete');
  assert.equal(outcome.toolCallCount, 2);
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(outcome.toolResults[0].result.services[0].id, 'wash');
  assert.equal(outcome.final.assistantResponse, 'I found the wash service. What vehicle should I use?');
});

test('blocks a repeated identical tool call instead of looping forever', async () => {
  let modelCalls = 0;
  let executions = 0;
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async () => { modelCalls += 1; return { toolName: 'listAvailableServices', toolArguments: {} }; } },
    executeTool: async () => { executions += 1; return { services: [] }; },
  });
  assert.equal(outcome.status, 'repeated-tool-call');
  assert.equal(modelCalls, 2);
  assert.equal(executions, 1);
});

test('returns a safe tool failure observation for the model to interpret', async () => {
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async (input) => input.toolResults.length
      ? { toolName: '', assistantResponse: 'I could not retrieve that just now.' }
      : { toolName: 'getBookingStatus', toolArguments: { requestId: 'request_123' } } },
    executeTool: async () => { throw Object.assign(new Error('Do not disclose raw error text'), { code: 'not-found' }); },
  });
  assert.equal(outcome.status, 'complete');
  assert.equal(outcome.toolResults[0].errorCode, 'not-found');
  assert.equal(outcome.toolResults[0].result, null);
});

test('stops before execution when the inbound message is superseded', async () => {
  let executions = 0;
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async () => ({ toolName: 'getBookingStatus', toolArguments: { requestId: 'request_123' } }) },
    beforeTool: async () => { throw Object.assign(new Error('stale event'), { code: 'stale' }); },
    executeTool: async () => { executions += 1; return { code: 'found' }; },
  });
  assert.equal(outcome.status, 'superseded');
  assert.equal(executions, 0);
});

test('does not execute a tool when the user reached the safe lookup rate limit', async () => {
  let executions = 0;
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async () => ({ toolName: 'getBookingStatus', toolArguments: { requestId: 'request_123' } }) },
    beforeTool: async () => { throw Object.assign(new Error('limited'), { code: 'tool-rate-limited' }); },
    executeTool: async () => { executions += 1; return { code: 'found' }; },
  });
  assert.equal(outcome.status, 'rate-limited');
  assert.equal(executions, 0);
});

test('enforces the configured tool-call limit', async () => {
  let calls = 0;
  const outcome = await runWhatsAppAgentLoop({
    maxToolCalls: 2,
    model: { classify: async () => ({ toolName: 'listAvailableServices', toolArguments: { page: ++calls } }) },
    executeTool: async () => ({ services: [] }),
  });
  assert.equal(outcome.status, 'tool-limit');
  assert.equal(outcome.toolCallCount, 2);
  assert.equal(outcome.toolResults.length, 2);
});

test('runs required workflow commands before the model final answer', async () => {
  const toolSequence = [];
  let modelCalls = 0;
  const outcome = await runWhatsAppAgentLoop({
    model: { classify: async () => {
      modelCalls += 1;
      return { intent: 'service_booking', serviceId: 'wash', toolName: '', assistantResponse: modelCalls === 3 ? 'What vehicle is it?' : '' };
    } },
    chooseTool: ({ toolResults }) => toolResults.length === 0
      ? { toolName: 'listAvailableServices', toolArguments: {} }
      : toolResults.some((item) => item.toolName === 'getServiceQuestionnaire')
        ? null
        : { toolName: 'getServiceQuestionnaire', toolArguments: { serviceId: 'wash' } },
    executeTool: async (name) => { toolSequence.push(name); return { code: 'ok' }; },
  });
  assert.equal(outcome.status, 'complete');
  assert.deepEqual(toolSequence, ['listAvailableServices', 'getServiceQuestionnaire']);
  assert.equal(outcome.final.assistantResponse, 'What vehicle is it?');
});
