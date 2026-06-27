import { getFunctionEndpoint, getFirebaseClients } from '../firebase/config';

function traceCustomerAi(stage, detail = {}) {
  const safeDetail = {};
  Object.entries(detail || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    safeDetail[key] = value;
  });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    event: 'customer_direct_ai_trace',
    stage,
    ...safeDetail,
  }));
}

function extractJsonObject(rawText = '') {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return null;

  const attempts = [
    () => JSON.parse(trimmed),
    () => {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      return fencedMatch?.[1] ? JSON.parse(fencedMatch[1].trim()) : null;
    },
    () => {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      return start >= 0 && end > start ? JSON.parse(trimmed.slice(start, end + 1)) : null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {}
  }

  return null;
}

function getCustomerSafeAiErrorMessage(value = '') {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();

  if (
    normalized.includes('prepayment credits are depleted')
    || normalized.includes('too many requests')
    || normalized.includes('[429')
    || normalized.includes('billing')
    || normalized.includes('generatecontent')
  ) {
    return 'The AI call service is temporarily unavailable. Please try again later.';
  }

  if (normalized.includes('unauthorized')) {
    return 'Your session expired. Please sign in again and retry the call.';
  }

  return raw || 'Unable to process the AI call right now.';
}

async function getCurrentIdToken() {
  try {
    const { auth } = getFirebaseClients();
    const currentUser = auth?.currentUser || null;
    const token = await currentUser?.getIdToken?.(false);
    return String(token || '').trim();
  } catch (error) {
    traceCustomerAi('auth_token_unavailable', {
      error: error?.message || 'Unknown auth token error',
    });
    return '';
  }
}

export async function streamCustomerAssistantTurn({
  customerName = '',
  requestState = {},
  serviceCatalog = [],
  questionPlan = {},
  conversation = [],
  customerText = '',
  appInstruction = '',
  onSpeakDelta,
  onUsage,
  signal,
} = {}) {
  const endpoint = getFunctionEndpoint('customerServiceAiTurn');
  const token = await getCurrentIdToken();
  const payload = {
    customerName,
    requestState,
    serviceCatalog,
    questionPlan,
    conversation,
    customerText,
    appInstruction,
  };
  const isGreeting = !String(customerText || '').trim() && !String(appInstruction || '').trim();

  traceCustomerAi('turn_start', {
    endpoint,
    isGreeting,
    hasCustomerText: Boolean(String(customerText || '').trim()),
    hasAppInstruction: Boolean(String(appInstruction || '').trim()),
    conversationCount: Array.isArray(conversation) ? conversation.length : 0,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  const responseText = await response.text();
  if (!response.ok) {
    const parsedError = extractJsonObject(responseText);
    const rawMessage = parsedError?.message || responseText || 'Unknown error';
    const safeMessage = getCustomerSafeAiErrorMessage(rawMessage);
    traceCustomerAi('stream_http_error', {
      status: response.status,
      body: String(responseText || '').slice(0, 1000),
    });
    throw new Error(safeMessage);
  }

  const parsed = extractJsonObject(responseText);
  if (!parsed) {
    traceCustomerAi('stream_parse_failed', {
      body: String(responseText || '').slice(0, 1000),
    });
    throw new Error(`Customer AI response was not valid JSON. Raw: ${String(responseText || '').slice(0, 160)}`);
  }

  if (parsed.success === false) {
    const message = String(parsed?.message || 'Customer AI request failed.').trim();
    traceCustomerAi('stream_request_failed', {
      message,
      status: parsed?.status || '',
    });
    throw new Error(getCustomerSafeAiErrorMessage(message));
  }

  const speak = String(parsed?.speak || '').trim();
  if (speak) {
    onSpeakDelta?.(speak);
  }
  if (parsed?.usageSummary) {
    onUsage?.(parsed.usageSummary);
  }

  traceCustomerAi('turn_complete', {
    mode: isGreeting ? 'greeting' : 'structured',
    status: String(parsed?.status || ''),
    speakLength: speak.length,
  });

  return {
    speak,
    status: String(parsed?.status || '').trim(),
    requestDraft: parsed?.requestDraft || null,
    selectionRequest: parsed?.selectionRequest || null,
    usageSummary: parsed?.usageSummary || null,
  };
}
