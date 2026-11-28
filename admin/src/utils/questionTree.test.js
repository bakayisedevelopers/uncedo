import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuestionImageGenerationContext,
  buildQuestionTree,
  enforceExclusiveServiceOptionQuestions,
  getPreferredDefaultTriggerValues,
  unlinkDirectDependentsOfQuestion,
} from './questionTree.js';

test('buildQuestionTree groups dependent questions as subtasks under their parent with hierarchical numbers', () => {
  const questions = [
    {
      draftKey: 'q_dye',
      id: 'want_dye',
      prompt: 'Do you want dye on your haircut or not?',
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
    {
      draftKey: 'q_length',
      id: 'hair_length',
      prompt: 'How short should the cut be?',
      options: [{ value: 'fade', label: 'Low fade' }],
    },
    {
      draftKey: 'q_dye_color',
      id: 'dye_color',
      prompt: 'What color of dye do you want?',
      dependencyRule: {
        dependsOnQuestionId: 'want_dye',
        dependsOnOptionValue: 'yes',
        dependsOnOptionValues: ['yes'],
      },
      options: [{ value: 'blonde', label: 'Blonde' }, { value: 'black', label: 'Jet Black' }],
    },
    {
      draftKey: 'q_dye_tone',
      id: 'dye_tone',
      prompt: 'Do you need bleach lift before applying that dye?',
      dependencyRule: {
        dependsOnQuestionId: 'dye_color',
        dependsOnOptionValue: 'blonde',
        dependsOnOptionValues: ['blonde'],
      },
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
    },
  ];

  const tree = buildQuestionTree(questions);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].id, 'want_dye');
  assert.equal(tree[0].hierarchyNumber, '1');
  assert.equal(tree[0].directChildCount, 1);
  assert.equal(tree[0].totalDescendantCount, 2);

  const sub1 = tree[0].children[0];
  assert.equal(sub1.id, 'dye_color');
  assert.equal(sub1.hierarchyNumber, '1.1');
  assert.equal(sub1.depth, 1);
  assert.equal(sub1.directChildCount, 1);

  const sub2 = sub1.children[0];
  assert.equal(sub2.id, 'dye_tone');
  assert.equal(sub2.hierarchyNumber, '1.1.1');
  assert.equal(sub2.depth, 2);

  assert.equal(tree[1].id, 'hair_length');
  assert.equal(tree[1].hierarchyNumber, '2');
  assert.equal(tree[1].directChildCount, 0);
});

test('buildQuestionTree falls back cleanly on missing parent or cycle without hiding questions', () => {
  const questions = [
    {
      draftKey: 'q_a',
      id: 'q_a',
      prompt: 'Question A',
      dependencyRule: { dependsOnQuestionId: 'q_b', dependsOnOptionValues: ['yes'] },
    },
    {
      draftKey: 'q_b',
      id: 'q_b',
      prompt: 'Question B',
      dependencyRule: { dependsOnQuestionId: 'q_a', dependsOnOptionValues: ['yes'] },
    },
    {
      draftKey: 'q_orphan',
      id: 'q_orphan',
      prompt: 'Orphan Question',
      dependencyRule: { dependsOnQuestionId: 'deleted_parent', dependsOnOptionValues: ['yes'] },
    },
  ];

  const tree = buildQuestionTree(questions);
  const visitedIds = [];
  const walk = (nodes) => {
    nodes.forEach((node) => {
      visitedIds.push(node.id);
      walk(node.children);
    });
  };
  walk(tree);
  assert.deepEqual(visitedIds.sort(), ['q_a', 'q_b', 'q_orphan']);
});

test('getPreferredDefaultTriggerValues defaults to yes for Yes/No parent questions and empty otherwise', () => {
  assert.deepEqual(
    getPreferredDefaultTriggerValues({
      options: [{ value: '', label: 'Yes' }, { value: '', label: 'No' }],
    }),
    ['yes'],
  );
  assert.deepEqual(
    getPreferredDefaultTriggerValues({
      options: [{ value: 'short', label: 'Short' }, { value: 'long', label: 'Long' }],
    }),
    [],
  );
});

test('unlinkDirectDependentsOfQuestion clears dangling parent links when parent question is removed', () => {
  const updated = unlinkDirectDependentsOfQuestion('want_dye', [
    { id: 'want_dye', prompt: 'Do you want dye?' },
    {
      id: 'dye_color',
      prompt: 'What color?',
      type: 'dependent',
      dependencyRule: {
        dependsOnQuestionId: 'want_dye',
        dependsOnOptionValue: 'yes',
        dependsOnOptionValues: ['yes'],
      },
    },
    { id: 'other', prompt: 'Other question', type: 'standard' },
  ]);

  assert.equal(updated.length, 2);
  assert.equal(updated[0].id, 'dye_color');
  assert.equal(updated[0].type, 'option-specific');
  assert.equal(updated[0].dependencyRule.dependsOnQuestionId, '');
  assert.deepEqual(updated[0].dependencyRule.dependsOnOptionValues, []);
  assert.equal(updated[1].id, 'other');
});

test('enforceExclusiveServiceOptionQuestions guarantees each option-specific question belongs to at most one option', () => {
  const cleaned = enforceExclusiveServiceOptionQuestions(
    [
      { id: 'opt_1', requiresNoOptionSpecificQuestions: true, selectedQuestionIds: ['q_shared'] },
      { id: 'opt_2', requiresNoOptionSpecificQuestions: false, selectedQuestionIds: ['q_shared', 'q_two'] },
      { id: 'opt_3', requiresNoOptionSpecificQuestions: false, selectedQuestionIds: ['q_shared', 'q_two', 'q_three'] },
    ],
    new Set(['q_shared', 'q_two', 'q_three']),
  );

  assert.deepEqual(cleaned[0].selectedQuestionIds, []);
  assert.deepEqual(cleaned[1].selectedQuestionIds, ['q_shared', 'q_two']);
  assert.deepEqual(cleaned[2].selectedQuestionIds, ['q_three']);
});

test('buildQuestionImageGenerationContext walks ancestor chain up to top linked Service Option and collects pictures', () => {
  const serviceOptions = [
    {
      id: 'fade_cut',
      title: 'Buzz Cut & Dye',
      description: 'Clean buzz cut with optional hair color.',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/app/o/buzz_cut.jpg',
      selectedQuestionIds: ['want_dye'],
      requiresNoOptionSpecificQuestions: false,
    },
    {
      id: 'beard_trim',
      title: 'Beard Trim',
      description: 'Precision trim.',
      imageUrl: 'https://firebasestorage.googleapis.com/v0/b/app/o/beard.jpg',
      selectedQuestionIds: ['beard_length'],
      requiresNoOptionSpecificQuestions: false,
    },
  ];

  const allQuestions = [
    {
      id: 'want_dye',
      type: 'option-specific',
      prompt: 'Do you want dye on your haircut?',
      options: [
        { value: 'yes', label: 'Yes', imageUrl: 'data:image/jpeg;base64,WUVTX1BJQw==' },
        { value: 'no', label: 'No', imageUrl: 'data:image/jpeg;base64,Tk9fUElD' },
      ],
    },
    {
      id: 'dye_color',
      type: 'dependent',
      prompt: 'What color of dye do you want?',
      dependencyRule: { dependsOnQuestionId: 'want_dye', dependsOnOptionValues: ['yes'] },
      options: [
        { value: 'blonde', label: 'Blonde', imageUrl: 'https://firebasestorage.googleapis.com/v0/b/app/o/blonde.jpg' },
        { value: 'red', label: 'Crimson Red', imageUrl: '' },
      ],
    },
    {
      id: 'blonde_shade',
      type: 'dependent',
      prompt: 'Which blonde shade do you want?',
      dependencyRule: { dependsOnQuestionId: 'dye_color', dependsOnOptionValues: ['blonde'] },
      options: [{ value: 'honey_blonde', label: 'Honey Blonde', imageUrl: '' }],
    },
  ];

  const ctx = buildQuestionImageGenerationContext({
    question: allQuestions[2],
    allQuestions,
    serviceOptions,
  });

  assert.deepEqual(ctx.serviceOption, {
    id: 'fade_cut',
    title: 'Buzz Cut & Dye',
    description: 'Clean buzz cut with optional hair color.',
  });
  assert.deepEqual(ctx.contextChain, [
    {
      questionId: 'want_dye',
      questionPrompt: 'Do you want dye on your haircut?',
      selectedAnswers: ['Yes'],
    },
    {
      questionId: 'dye_color',
      questionPrompt: 'What color of dye do you want?',
      selectedAnswers: ['Blonde'],
    },
  ]);
  assert.equal(ctx.contextImages.length, 3);
  assert.equal(ctx.contextImages[0].imageUrl, 'https://firebasestorage.googleapis.com/v0/b/app/o/blonde.jpg');
  assert.equal(ctx.contextImages[1].imageUrl, 'https://firebasestorage.googleapis.com/v0/b/app/o/buzz_cut.jpg');
  assert.equal(ctx.contextImages[2].imageDataUrl, 'data:image/jpeg;base64,WUVTX1BJQw==');
});
