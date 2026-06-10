import { useMemo } from 'react';
import { parseQuestionsFromExtraction, parseQuestionsFromGptExtraction } from '../../services/questionParsingService';

function normalizeQuestions(boardPreparationSource) {
  const source = boardPreparationSource || {};
  const extractedText = String(source?.extractedText || source?.combinedText || source?.typedText || '').trim();
  const attachments = Array.isArray(source?.attachments) ? source.attachments : [];
  const attachmentExtractions = Array.isArray(source?.attachmentExtractions) ? source.attachmentExtractions : [];
  const ocrImageReferences = Array.isArray(source?.ocrImageReferences) ? source.ocrImageReferences : [];

  const gptQuestions = parseQuestionsFromGptExtraction({
    gptExtraction: source?.documentAiExtraction || source?.gptExtraction || null,
    attachments,
  });
  const parsed = gptQuestions?.length
    ? gptQuestions
    : parseQuestionsFromExtraction({ extractedText, attachments, attachmentExtractions, ocrImageReferences });

  return Array.isArray(parsed) ? parsed : [];
}

export default function AiClassWhiteboard({
  boardPreparationSource,
  transcript = '',
  boardActions = [],
  activeQuestionId = null,
  answersByQuestion = {},
}) {
  const questions = useMemo(() => normalizeQuestions(boardPreparationSource), [boardPreparationSource]);
  const activeQuestion = useMemo(() => {
    if (!questions.length) return null;
    const withFallbackIds = questions.map((question, index) => ({
      ...question,
      _qid: question?.questionId || `q${index + 1}`,
      _qindex: index + 1,
    }));
    if (activeQuestionId) {
      const found = withFallbackIds.find((question) => question._qid === activeQuestionId);
      if (found) return found;
    }
    return withFallbackIds[0];
  }, [activeQuestionId, questions]);

  return (
    <div className="grid h-full grid-cols-1 gap-4 bg-white p-4 md:grid-cols-12">
      <section className="md:col-span-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-700">Active Question</h3>
        <div className="mt-3 space-y-3 overflow-auto pr-2">
          {activeQuestion ? (
            <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-3 text-sm">
              <p className="font-semibold text-zinc-800">{activeQuestion?.questionNumber ? `Question ${activeQuestion.questionNumber}` : `Question ${activeQuestion._qindex}`}</p>
              <p className="mt-2 whitespace-pre-wrap text-zinc-700">{String(activeQuestion?.text || '').trim() || 'No extracted text.'}</p>
              {(answersByQuestion?.[activeQuestion._qid] || []).length ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Answers</p>
                  <div className="mt-1 space-y-1">
                    {(answersByQuestion[activeQuestion._qid] || []).map((entry, answerIndex) => (
                      <div key={`${activeQuestion._qid}-a-${answerIndex}`} className="rounded-md border border-zinc-200 bg-white p-2">
                        <p className="whitespace-pre-wrap text-xs text-zinc-700">{String(entry?.text || '').trim()}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">
                          {entry?.textMode === 'readwrite' ? 'Read + Write' : 'Read Only'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="mt-3 text-xs text-zinc-500">No answers saved yet for this question.</p>}
            </div>
          ) : <p className="text-sm text-zinc-500">Preparing whiteboard questions...</p>}
        </div>
      </section>

      <section className="md:col-span-7 rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-zinc-700">AI Explanation Board</h3>
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
          <p className="font-semibold text-zinc-800">Live explanation</p>
          <p className="mt-2 whitespace-pre-wrap">{transcript || 'The AI tutor transcript will appear here.'}</p>
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Board Actions</p>
          <div className="mt-2 max-h-[40vh] space-y-2 overflow-auto pr-2">
            {boardActions.length ? boardActions.map((action, index) => (
              <div key={`${action?.type || 'action'}-${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
                <p className="font-semibold text-zinc-800">{action?.type || 'action'}</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">{String(action?.text || action?.content || '').trim() || 'No text payload.'}</p>
                {action?.imageRef ? <p className="mt-1 text-xs text-zinc-500">Image ref: {String(action.imageRef)}</p> : null}
                {/* TODO: Render highlight ranges once highlightText action format is finalized. */}
              </div>
            )) : <p className="text-sm text-zinc-500">No board actions yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
