const fs = require('fs');
const filePath = 'web/src/pages/app/student/StudentDashboardPage.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove old imports
content = content.replace(
  `import {\n  extractAttachments,\n} from '../../../services/attachmentExtractionService';`,
  `import { extractAttachmentsWithGPT } from '../../../services/gptExtractionService';`
);

content = content.replace(
  `import {\n  buildSubjectClassificationInput,\n  classifySubjectFromText,\n} from '../../../services/subjectClassificationService';`,
  `// Removed old subject classification imports`
);

// 2. Update `buildBoardPreparationSource`
const oldBuildBoardSource = `function buildBoardPreparationSource({ attachments = [], uploadedAttachments = [], attachmentExtractionByKey = {} }) {`;
const newBuildBoardSource = `function buildBoardPreparationSource({ attachments = [], uploadedAttachments = [], attachmentExtractionByKey = {}, gptExtraction = null }) {
  if (gptExtraction) {
    return {
      extractedText: '',
      attachmentExtractions: [],
      ocrImageReferences: [],
      gptExtraction,
    };
  }
`;
content = content.replace(oldBuildBoardSource, newBuildBoardSource);

// 3. Update `StudentDashboardPage` state variables for GPT extraction
content = content.replace(
  `const [attachmentExtractionStatusByKey, setAttachmentExtractionStatusByKey] = useState({});`,
  `const [attachmentExtractionStatusByKey, setAttachmentExtractionStatusByKey] = useState({});\n  const [gptExtraction, setGptExtraction] = useState(null);`
);

// 4. Update `onFileChange`
const oldOnFileChange = `  const onFileChange = (event) => {
    const files = Array.from(event.target.files || []);`;
const newOnFileChange = `  const onFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (!validFiles.length) {
      event.target.value = '';
      return;
    }

    const existingKeys = new Set(attachmentsRef.current.map((file) => getAttachmentKey(file)));
    const newFilesForExtraction = validFiles.filter((file) => !existingKeys.has(getAttachmentKey(file)));

    if (!newFilesForExtraction.length) {
      event.target.value = '';
      return;
    }

    setStage('input');
    setAdvanceIntent('attachment');
    setError('');
    setUnsupportedSubjectRequest(null);
    setShowExtractionOverlay(true);
    setShowSlowExtractionMessage(false);
    setExtractionOverlayState('processing');

    const nextAttachments = [...attachmentsRef.current, ...newFilesForExtraction];
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);

    try {
      setClassificationState('running');
      setClassificationStatus('Analyzing your request...');
      
      const extractionResult = await extractAttachmentsWithGPT(nextAttachments);
      
      setGptExtraction(extractionResult);
      setClassifiedTopic(extractionResult.topics?.[0] || '');
      setEstimatedMinutes(extractionResult.estimatedMinutes || DEFAULT_LESSON_DURATION);
      
      // Check subject compatibility
      let foundSubject = '';
      let isSupported = false;
      const normalizedDetected = (extractionResult.subject || '').toLowerCase();
      
      if (normalizedDetected && normalizedDetected !== 'unknown') {
        const matched = subjectOptions.find((opt) => opt.value.toLowerCase() === normalizedDetected || opt.label.toLowerCase() === normalizedDetected);
        if (matched) {
          foundSubject = matched.value;
          isSupported = true;
        } else {
          // Check aliases
          const aliasMatch = subjectOptions.find((opt) => {
             const aliases = SUBJECT_ALIASES[opt.value] || [];
             return aliases.some(alias => normalizedDetected.includes(alias));
          });
          if (aliasMatch) {
            foundSubject = aliasMatch.value;
            isSupported = true;
          }
        }
      }

      setClassificationState('done');
      if (isSupported) {
        setSelectedSubject(foundSubject);
        setClassificationStatus('Subject and study focus detected from your request.');
        setUnsupportedSubjectRequest(null);
      } else {
        setSelectedSubject('');
        setClassificationStatus(extractionResult.subject && extractionResult.subject !== 'Unknown' ? \`Sorry, \${extractionResult.subject} is not offered yet.\` : 'Choose the subject manually before sending.');
        if (extractionResult.subject && extractionResult.subject !== 'Unknown') {
          setUnsupportedSubjectRequest({
            subject: extractionResult.subject,
            inputText: '',
            recorded: false,
          });
        }
      }
      if (!hasManualDurationOverride) {
        setDurationMinutes(extractionResult.estimatedMinutes || DEFAULT_LESSON_DURATION);
      }
      
      // Update dummy extraction status so the icons show "Done"
      const statusUpdates = {};
      nextAttachments.forEach(file => {
         statusUpdates[getAttachmentKey(file)] = 'text extracted';
      });
      setAttachmentExtractionStatusByKey(statusUpdates);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Extraction failed. Please try again or upload a clearer image.');
      setClassificationState('done');
      setClassificationStatus('Choose the subject manually before sending.');
      
      // Update dummy extraction status so the icons show "Error"
      const statusUpdates = {};
      nextAttachments.forEach(file => {
         statusUpdates[getAttachmentKey(file)] = 'fallback needed';
      });
      setAttachmentExtractionStatusByKey(statusUpdates);
    } finally {
      setExtractionOverlayState('done');
    }
    
    event.target.value = '';
  };`;

const onFileChangeStart = content.indexOf(`  const onFileChange = (event) => {`);
const removeAttachmentStart = content.indexOf(`  const removeAttachment = (indexToRemove) => {`);

if (onFileChangeStart !== -1 && removeAttachmentStart !== -1) {
  content = content.slice(0, onFileChangeStart) + newOnFileChange + '\n\n' + content.slice(removeAttachmentStart);
}

// 5. Remove the massive classification useEffect
const effectStart = content.indexOf(`  useEffect(() => {\n    if (isManualSubjectRef.current) return;\n\n    const extractionResults = Object.values(attachmentExtractionByKey || {});`);
const effectEnd = content.indexOf(`  }, [topic, attachmentExtractionByKey, hasManualDurationOverride, subjectOptions]);`);

if (effectStart !== -1 && effectEnd !== -1) {
  content = content.slice(0, effectStart) + `  // Old text classification effect removed\n` + content.slice(effectEnd + `  }, [topic, attachmentExtractionByKey, hasManualDurationOverride, subjectOptions]);`.length);
}

// 6. Update `boardPreparationSource` construction in `confirmRequest`
content = content.replace(
  `const boardPreparationSource = buildBoardPreparationSource({\n        attachments,\n        uploadedAttachments,\n        attachmentExtractionByKey,\n      });`,
  `const boardPreparationSource = buildBoardPreparationSource({\n        attachments,\n        uploadedAttachments,\n        attachmentExtractionByKey,\n        gptExtraction,\n      });`
);

// 7. Update removeAttachment to clear gptExtraction if no attachments
const oldRemoveEnd = `    setStage('input');\n    setAdvanceIntent(nextAttachments.length ? 'attachment' : '');\n  };`;
const newRemoveEnd = `    setStage('input');\n    setAdvanceIntent(nextAttachments.length ? 'attachment' : '');\n    if (nextAttachments.length === 0) setGptExtraction(null);\n  };`;
content = content.replace(oldRemoveEnd, newRemoveEnd);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Frontend patch 2 applied.');
