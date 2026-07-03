import {
  buildMissingRequiredFields,
  formatCustomerIntakeOptionLabel,
  getNextCustomerIntakeQuestion,
} from '../constants/customerIntakeQuestions';
import { getCustomerServiceCategoryById, getCustomerServiceById } from '../constants/serviceCatalog';

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeEnumAnswer(question, text) {
  const normalized = normalizeText(text).toLowerCase();
  const options = Array.isArray(question?.options) ? question.options : [];
  const exactMatch = options.find((option) => {
    const optionValue = normalizeText(option?.value || option).toLowerCase();
    const optionLabel = normalizeText(option?.label || option).toLowerCase();
    return normalized === optionValue || normalized === optionLabel;
  });
  if (exactMatch) {
    return String(exactMatch.value || exactMatch).trim();
  }

  const keywordMap = {
    now: ['now', 'asap', 'immediately'],
    later: ['later', 'schedule', 'scheduled', 'tomorrow'],
    current_location: ['current location', 'my location', 'here'],
    saved_home_address: ['saved address', 'home address', 'my address'],
    another_address: ['another address', 'different address', 'new address'],
    helper_location: ['helper location'],
    yes: ['yes', 'yeah', 'yep'],
    no: ['no', 'nope'],
  };

  for (const option of options) {
    const optionValue = String(option?.value || option).trim();
    const keywords = keywordMap[optionValue] || [];
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return optionValue;
    }
  }

  return normalizeText(text);
}

function buildAssistantPrompt({ requestState = {}, appInstruction = '' } = {}) {
  if (appInstruction) {
    if (appInstruction.toLowerCase().includes('final price shown')) {
      return 'Your request details are ready. Review the price card below, then confirm or decline.';
    }
    if (appInstruction.toLowerCase().includes('reconnected')) {
      return 'Welcome back. Continue with the next missing detail below.';
    }
  }

  if (!requestState?.categoryId) {
    return 'Choose a service category below to begin.';
  }

  if (!Array.isArray(requestState?.serviceIds) || !requestState.serviceIds.length) {
    const categoryLabel = getCustomerServiceCategoryById(requestState.categoryId)?.label || 'this category';
    return `Choose a package or individual service for ${categoryLabel}.`;
  }

  const nextQuestion = getNextCustomerIntakeQuestion({
    categoryId: requestState.categoryId,
    serviceIds: requestState.serviceIds,
    selectedPackageId: requestState.selectedPackageId,
    structuredAnswers: requestState.structuredAnswers || {},
  });

  if (nextQuestion?.prompt) {
    return nextQuestion.prompt;
  }

  return 'I have enough details to prepare your final price.';
}

function buildRequestDraft({ requestState = {}, customerText = '' } = {}) {
  const currentQuestion = getNextCustomerIntakeQuestion({
    categoryId: requestState.categoryId,
    serviceIds: requestState.serviceIds,
    selectedPackageId: requestState.selectedPackageId,
    structuredAnswers: requestState.structuredAnswers || {},
  });

  if (!currentQuestion) {
    return null;
  }

  const nextAnswer = currentQuestion.answerType === 'enum'
    ? normalizeEnumAnswer(currentQuestion, customerText)
    : normalizeText(customerText);

  if (!nextAnswer) {
    return null;
  }

  return {
    structuredAnswers: {
      [currentQuestion.id]: nextAnswer,
    },
  };
}

export async function streamCustomerAssistantTurn({
  requestState = {},
  customerText = '',
  appInstruction = '',
  onSpeakDelta,
  onUsage,
} = {}) {
  const requestDraft = appInstruction ? null : buildRequestDraft({ requestState, customerText });
  const mergedState = {
    ...requestState,
    structuredAnswers: {
      ...(requestState.structuredAnswers || {}),
      ...((requestDraft && requestDraft.structuredAnswers) || {}),
    },
  };

  const missingRequired = buildMissingRequiredFields({
    categoryId: mergedState.categoryId,
    serviceIds: mergedState.serviceIds,
    selectedPackageId: mergedState.selectedPackageId,
    structuredAnswers: mergedState.structuredAnswers,
  });
  const nextQuestion = getNextCustomerIntakeQuestion({
    categoryId: mergedState.categoryId,
    serviceIds: mergedState.serviceIds,
    selectedPackageId: mergedState.selectedPackageId,
    structuredAnswers: mergedState.structuredAnswers,
  });
  const selectedServiceLabel = getCustomerServiceById(mergedState.selectedPackageId || mergedState.serviceIds?.[0])?.label || '';

  let speak = buildAssistantPrompt({ requestState: mergedState, appInstruction });
  if (!appInstruction && requestDraft?.structuredAnswers && customerText) {
    const answerText = formatCustomerIntakeOptionLabel(Object.values(requestDraft.structuredAnswers)[0]);
    speak = nextQuestion?.prompt
      ? `Noted: ${answerText}. ${nextQuestion.prompt}`
      : missingRequired.length
        ? `Noted: ${answerText}. Continue with the next detail below.`
        : `Noted: ${answerText}. ${selectedServiceLabel ? `${selectedServiceLabel} details are complete.` : 'Your details are complete.'}`;
  }

  onSpeakDelta?.(speak);
  onUsage?.(null);

  return {
    speak,
    status: missingRequired.length ? 'collecting_details' : 'ready_for_quote',
    requestDraft,
    selectionRequest: nextQuestion
      ? {
          questionId: nextQuestion.id,
          prompt: nextQuestion.prompt,
        }
      : null,
    usageSummary: null,
  };
}
