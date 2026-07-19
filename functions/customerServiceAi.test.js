const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAiPayload,
  buildGreetingPrompt,
  buildJsonTurnPrompt,
} = require('./customerServiceAi');

test('parseAiPayload parses valid compact JSON with correctedCustomerText', () => {
  const json = '{"speak":"Hello","status":"collecting","correctedCustomerText":"Hi","requestDraft":{"categoryId":"cleaning"}}';
  const result = parseAiPayload(json);

  assert.equal(result.speak, 'Hello');
  assert.equal(result.status, 'collecting');
  assert.equal(result.correctedCustomerText, 'Hi');
  assert.deepEqual(result.requestDraft, { categoryId: 'cleaning' });
});

test('parseAiPayload handles JSON fenced in markdown code blocks', () => {
  const markdown = '```json\n{"speak":"Hello there","status":"ready_to_search","correctedCustomerText":"Hello.","requestDraft":null}\n```';
  const result = parseAiPayload(markdown);

  assert.equal(result.speak, 'Hello there');
  assert.equal(result.status, 'ready_to_search');
  assert.equal(result.correctedCustomerText, 'Hello.');
  assert.equal(result.requestDraft, null);
});

test('parseAiPayload returns defaults for empty or invalid input', () => {
  const resultEmpty = parseAiPayload('');
  assert.equal(resultEmpty.speak, '');
  assert.equal(resultEmpty.correctedCustomerText, '');

  const resultInvalid = parseAiPayload('not json');
  assert.equal(resultInvalid.speak, 'not json');
  assert.equal(resultInvalid.correctedCustomerText, '');
});

test('buildGreetingPrompt greets customer by first name', () => {
  const prompt = buildGreetingPrompt({ customerName: 'Jabu' });
  assert.match(prompt, /Jabu/);
  assert.match(prompt, /Uncedo/);
});

test('buildJsonTurnPrompt includes correctedCustomerText in JSON shape instructions', () => {
  const prompt = buildJsonTurnPrompt({
    customerName: 'Jabu',
    customerText: 'i need lawn mowing',
  });
  
  assert.match(prompt, /correctedCustomerText/);
  assert.match(prompt, /grammatical/);
  assert.match(prompt, /contraction/);
});
