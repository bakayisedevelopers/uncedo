# Functions Cleanup Status

Updated: `2026-07-01`

Status legend:
- `BACKEND_ACTIVE`: still exported from `functions/index.js`
- `FRONTEND_MOVED`: backend export removed and flow now handled in app code
- `DELETED`: removed from backend and removed from active app flow
- `REMOVED_WITH_WEB`: removed as part of old web/tutor-only cleanup

Current exported backend functions in [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js):
- `syncServiceRequestLifecycle`
- `syncServiceRequestAssignmentState`
- `trackHelperRequestStats`
- `trackCustomerServiceEvents`
- `reconcileServiceRequestOffers`
- `promoteScheduledServiceRequests`
- `syncClassRequestLifecycle`
- `trackTutorRequestStats`
- `trackTutorSessionStats`
- `syncHelperQueueOnHelperOnline`
- `syncStudentReferralRewardsOnUserWrite`
- `sendWelcomeEmailOnUserCreate`
- `acceptHelperAgreement`
- `publishHelperAgreementVersion`
- `mobileWebviewAuth`
- `getIceConfig`
- `verifyPaystack`
- `finalizeSessionBilling`
- `finalizeServiceRequestBilling`
- `cancelCustomerServiceRequest`
- `submitServiceRequestRating`
- `processWeeklyHelperPayouts`
- `sendEmailFromQueue`

## Current Status By Function

| Function | Previous role | Current status | Backend trigger / code shape | Current location / replacement | Note |
|---|---|---|---|---|---|
| `customerServiceAiTurn` | Customer AI intake turn | `DELETED` | Removed export | Removed from backend and customer flow | No AI chat intake remains in active flow |
| `customerServiceMediaSummary` | AI media summary for customer uploads | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/customerServiceMediaService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceMediaService.js) | Now returns local fallback summary logic |
| `getServicePricingQuote` | Customer service quote preview | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/customerServiceRequestService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceRequestService.js), [uncedo/src/services/pricingService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/pricingService.js) | Preview quote now computed client-side |
| `cancelCustomerServiceRequest` | Customer cancellation with possible fee logic | `BACKEND_ACTIVE` | `onRequest`, `cors`, payment secrets | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend because billing/cancellation authority is still needed |
| `submitServiceRequestRating` | Customer/helper ratings | `BACKEND_ACTIVE` | `onRequest`, `cors` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still backend for participant validation and aggregate updates |
| `getNearbyHelpersMapData` | Customer map query + write-on-read | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/nearbyHelpersMapService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/nearbyHelpersMapService.js) | Replaced with Firestore query and client filtering |
| `getNearbyActiveCustomersMapData` | Helper map query + write-on-read | `FRONTEND_MOVED` | Removed export | [helpers/src/services/nearbyCustomersMapService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/nearbyCustomersMapService.js) | Replaced with Firestore query and client filtering |
| `updateHelperLiveLocation` | Helper live location publish | `FRONTEND_MOVED` | Removed export | [helpers/src/services/helperLocationService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/helperLocationService.js) | Direct client write now used |
| `finalizeServiceRequestBilling` | Helper job billing finalization | `BACKEND_ACTIVE` | `onRequest`, `cors`, payment secrets | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend because it can charge money and finalize payouts |
| `getHelperAgreement` | Helper/admin agreement read | `FRONTEND_MOVED` | Removed export | [helpers/src/services/legalAgreementService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/legalAgreementService.js), [admin/src/services/helperAgreementService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/helperAgreementService.js) | Read path moved to Firestore client reads |
| `acceptHelperAgreement` | Helper agreement acceptance | `BACKEND_ACTIVE` | `onRequest`, `cors`, `memory: 1GiB` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend for authoritative acceptance record |
| `publishHelperAgreementVersion` | Admin agreement publishing | `BACKEND_ACTIVE` | `onRequest`, `cors` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend for admin-only version publishing |
| `getPricingQuote` | Student session quote preview | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/pricingService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/pricingService.js) | Preview moved client-side |
| `extractImageOcr` | OCR for attachments | `DELETED` | Removed export | Removed from backend flow | AI/OCR backend path removed |
| `classifySubject` | Subject/topic/minutes classifier | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/subjectClassificationService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/subjectClassificationService.js) | Now local heuristic/fallback classification |
| `saveAcademicBrainFeedback` | Academic Brain feedback writer | `DELETED` | Removed export | Removed from backend and app usage | AI training/feedback path removed |
| `syncStudentGrowth` | Growth/profile sync | `FRONTEND_MOVED` | Removed export | [uncedo/src/services/studentGrowthService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/studentGrowthService.js) | Moved into direct client/Firestore sync |
| `mobileWebviewAuth` | WebView auth bridge | `BACKEND_ACTIVE` | `onRequest`, `cors` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still required for custom auth token handoff |
| `getIceConfig` | TURN/ICE credentials | `BACKEND_ACTIVE` | `onRequest`, `cors`, secrets | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still required because it uses secrets |
| `finalizeSessionBilling` | Session billing finalization | `BACKEND_ACTIVE` | `onRequest`, `cors`, payment secrets | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend because it charges money |
| `verifyPaystack` | Payment-method verification | `BACKEND_ACTIVE` | `onRequest`, `cors`, payment secrets | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Kept backend because it uses payment secrets |
| `syncServiceRequestLifecycle` | Service request orchestration trigger | `BACKEND_ACTIVE` | `onDocumentWritten(serviceRequests/{requestId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still part of active helper/customer flow |
| `syncServiceRequestAssignmentState` | Assignment state trigger | `BACKEND_ACTIVE` | `onDocumentWritten(serviceRequests/{requestId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `trackHelperRequestStats` | Helper request stats trigger | `BACKEND_ACTIVE` | `onDocumentWritten(serviceRequests/{requestId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `trackCustomerServiceEvents` | Customer recommendation event trigger | `BACKEND_ACTIVE` | `onDocumentCreated(customerServiceEvents/{eventId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `reconcileServiceRequestOffers` | Offer-expiry scheduler | `BACKEND_ACTIVE` | `onSchedule('every 1 minutes')` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `promoteScheduledServiceRequests` | Scheduled-request promotion scheduler | `BACKEND_ACTIVE` | `onSchedule('every 1 minutes')` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `syncHelperQueueOnHelperOnline` | Helper online-state trigger | `BACKEND_ACTIVE` | `onDocumentWritten(users/{uid})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `processWeeklyHelperPayouts` | Helper payout scheduler | `BACKEND_ACTIVE` | `onSchedule(...)` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `syncStudentReferralRewardsOnUserWrite` | Referral reward trigger | `BACKEND_ACTIVE` | `onDocumentWritten(users/{uid})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `sendWelcomeEmailOnUserCreate` | Welcome email queue trigger | `BACKEND_ACTIVE` | `onDocumentCreated(users/{uid})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `sendEmailFromQueue` | Resend delivery trigger | `BACKEND_ACTIVE` | `onDocumentCreated(...)` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active |
| `syncClassRequestLifecycle` | Class request orchestration | `BACKEND_ACTIVE` | `onDocumentWritten(classRequests/{requestId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active for legacy student/class flow |
| `trackTutorRequestStats` | Tutor request stats | `BACKEND_ACTIVE` | `onDocumentWritten(classRequests/{requestId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active for class flow |
| `contentExtractionForWhiteboard` | Whiteboard extraction trigger | `DELETED` | Removed export | Removed from backend | AI extraction path removed |
| `trackTutorSessionStats` | Tutor session stats | `BACKEND_ACTIVE` | `onDocumentWritten(sessions/{sessionId})` | [functions/index.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js) | Still active for class flow |
| `deletePaymentMethod` | Old payment-method delete endpoint | `DELETED` | Removed export | Removed from backend | Not part of current active flow |
| `getTutorAgreement` | Tutor agreement read | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `acceptTutorAgreement` | Tutor agreement acceptance | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `emailSignedTutorAgreement` | Tutor agreement email helper endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `publishTutorAgreementVersion` | Tutor agreement publishing | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `verifyTutorPayoutAccount` | Tutor payout verification | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `listTutorPayoutBanks` | Tutor payout bank list | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `payOutstandingBalance` | Tutor/student web payment endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained web scope |
| `extractAttachmentAi` | Old deprecated attachment AI endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | AI path removed |
| `streamAttachmentAi` | Old deprecated streaming AI endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | AI path removed |
| `processTutorDocument` | Tutor document AI processing | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | AI path removed |
| `retryTutorDocumentProcessing` | Tutor document retry endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | AI path removed |
| `updateGlobalSubjects` | Subject catalog refresh endpoint | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer needed after AI/tutor cleanup |
| `refreshGlobalSubjectsOnTutorChange` | Tutor subject refresh trigger | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer needed after AI/tutor cleanup |
| `notifyTutorProfileCompletion` | Tutor profile completion notifier | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained scope |
| `deleteCompletedClassUploads` | Class upload cleanup | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained tutor/web scope |
| `processWeeklyTutorPayouts` | Tutor payout scheduler | `REMOVED_WITH_WEB` | Removed export | Removed during web/tutor cleanup | No longer in retained tutor/web scope |

## AI/OCR Code Status

Removed from repo:
- `functions/customerServiceAi.js`
- `functions/aiSubjectExtraction.js`
- `functions/geminiExtraction.js`
- `functions/googleCloudPricing.js`
- `functions/academicBrain/`
- `functions/ai/`
- `functions/ocr/`
- `functions/extraction/`
- `functions/ml/`
- `services/gemini-live-proxy/`
- `services/paddle-ocr-service/`

Remaining frontend/local files still present in source:
- [uncedo/src/services/customerDirectAiService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerDirectAiService.js)
- [uncedo/src/services/customerServiceMediaService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceMediaService.js)
- [uncedo/src/services/subjectClassificationService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/subjectClassificationService.js)
- [uncedo/src/services/attachmentExtractionService.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/attachmentExtractionService.js)

Notes:
- Some of the above files still use legacy `ai` or `extraction` names even though the backend functions were removed.
- `uncedo/dist/` still contains stale compiled references to removed AI/chat flows from earlier builds. Those are generated artifacts, not live source-of-truth code.

## Customer Intake Chat Screen Status

- `CustomerServiceCallScreen`: `DELETED`
- Route `CustomerServiceCall`: `DELETED`
- Active customer flow now goes through:
  - [uncedo/src/screens/customer/CustomerHomeScreen.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerHomeScreen.js)
  - [uncedo/src/screens/customer/CustomerServiceSelectionScreen.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerServiceSelectionScreen.js)
  - [uncedo/src/screens/customer/ServiceRequestTrackingScreen.js](/abs/path/C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/ServiceRequestTrackingScreen.js)

## Summary

Current counts from the cleanup state:
- `23` backend exports still active
- `8` functions moved to frontend or direct client logic
- `5` app-linked AI/frontend functions deleted outright
- `17` web/tutor/unused functions removed in the earlier cleanup wave

Backend is now limited to functions that still handle:
- payments
- payouts
- auth token bridging
- TURN/ICE credential generation
- helper agreement acceptance/publishing
- multi-user orchestration triggers and schedulers
- email queue delivery
