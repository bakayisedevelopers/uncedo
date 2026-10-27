'use strict';

function questionnaireNeedsExtractionPass({ intent = '', availableQuestions = [], questionnaire = [] } = {}) {
  if (intent !== 'service_booking' || !Array.isArray(questionnaire) || questionnaire.length === 0) return false;
  const availableIds = new Set((Array.isArray(availableQuestions) ? availableQuestions : [])
    .map((question) => String(question?.id || '').trim())
    .filter(Boolean));
  return questionnaire.some((question) => {
    const id = String(question?.id || '').trim();
    return id && !availableIds.has(id);
  });
}

function getFirstMissingRequiredQuestion(questions = [], missingQuestionIds = []) {
  const missingId = String((Array.isArray(missingQuestionIds) ? missingQuestionIds : [])[0] || '').trim();
  if (!missingId) return null;
  return (Array.isArray(questions) ? questions : []).find((question) => String(question?.id || '').trim() === missingId) || null;
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
  getFirstMissingRequiredQuestion,
  questionnaireNeedsExtractionPass,
};
