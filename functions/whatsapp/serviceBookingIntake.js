'use strict';

function questionnaireNeedsExtractionPass({ intent = '', questionnaire = [] } = {}) {
  if (intent !== 'service_booking' || !Array.isArray(questionnaire) || questionnaire.length === 0) return false;
  // Re-run extraction with the authoritative questionnaire on every booking
  // turn; the general intent pass can miss answers even when it saw the form.
  return true;
}

function getMissingRequiredQuestions(questions = [], missingQuestionIds = []) {
  const missingIds = new Set((Array.isArray(missingQuestionIds) ? missingQuestionIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean));
  return (Array.isArray(questions) ? questions : [])
    .filter((question) => missingIds.has(String(question?.id || '').trim()));
}

async function extractQuestionnaireAnswers({
  model,
  message,
  service,
  questions = [],
  existingAnswers = {},
  fallbackAnswers = {},
} = {}) {
  if (!model || typeof model.classify !== 'function') {
    return { answers: fallbackAnswers, attempted: false, fallback: true, errorCode: 'questionnaire_model_unavailable' };
  }

  try {
    const result = await model.classify({
      message,
      recentHistory: [],
      conversationSummary: {},
      conversationState: {
        mode: 'booking_intake',
        intent: 'service_booking',
        selectedServiceId: String(service?.id || ''),
        answers: existingAnswers,
        missingQuestionIds: (Array.isArray(questions) ? questions : [])
          .filter((question) => question?.required === true && !String(existingAnswers?.[question.id] ?? '').trim())
          .map((question) => question.id),
      },
      services: service ? [{
        id: service.id,
        categoryId: service.categoryId,
        label: service.label,
        description: service.description,
      }] : [],
      questions,
      availableTools: [],
      answerExtractionOnly: true,
    });

    return {
      answers: result?.extractedAnswers && typeof result.extractedAnswers === 'object' && !Array.isArray(result.extractedAnswers)
        ? result.extractedAnswers
        : {},
      attempted: true,
      fallback: false,
      provider: result?.provider || null,
      model: result?.model || null,
    };
  } catch (error) {
    return {
      answers: fallbackAnswers,
      attempted: true,
      fallback: true,
      errorCode: String(error?.code || 'questionnaire_extraction_failed').slice(0, 100),
    };
  }
}

module.exports = {
  extractQuestionnaireAnswers,
  getMissingRequiredQuestions,
  questionnaireNeedsExtractionPass,
};
