'use strict';

const MAX_ASSISTANT_ATTEMPTS = 2;

function isManuallyRetryableAssistantJob(job = {}) {
  return job.status === 'failed'
    && job.phase === 'classification'
    && job.toolExecutionStarted !== true
    && job.outboundAttempted !== true
    && !job.recoveryJobId
    && Number(job.attemptCount || 0) < MAX_ASSISTANT_ATTEMPTS
    && Boolean(String(job.identityId || '').trim())
    && Boolean(String(job.eventId || '').trim());
}

function sanitizeAssistantFailure(jobId, job = {}) {
  return {
    jobId: String(jobId || ''),
    status: String(job.status || 'unknown'),
    phase: String(job.phase || 'unknown'),
    errorCode: String(job.errorCode || 'unknown').slice(0, 120),
    attemptCount: Math.max(0, Number(job.attemptCount || 0)),
    manualRecoveryAvailable: isManuallyRetryableAssistantJob(job),
    createdAtMs: Number(job.createdAtMs || job.createdAt?.toMillis?.() || 0),
    updatedAtMs: Number(job.updatedAtMs || job.updatedAt?.toMillis?.() || 0),
  };
}

module.exports = { MAX_ASSISTANT_ATTEMPTS, isManuallyRetryableAssistantJob, sanitizeAssistantFailure };
