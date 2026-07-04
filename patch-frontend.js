const fs = require('fs');

let content = fs.readFileSync('web/src/pages/app/student/StudentDashboardPage.jsx', 'utf8');

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
    } catch (err) {
      console.error(err);
      setError(err.message || 'Extraction failed. Please try again or upload a clearer image.');
      setClassificationState('done');
      setClassificationStatus('Choose the subject manually before sending.');
    } finally {
      setExtractionOverlayState('done');
    }
    
    event.target.value = '';
  };

  // Deprecated old file handler block`;
  
// I'll use regex to replace the entire old onFileChange function
const onFileChangeRegex = /const onFileChange = \(event\) => \{[\s\S]*?event\.target\.value = '';\n  \};/g;
content = content.replace(onFileChangeRegex, newOnFileChange);

// 5. Remove the massive classification useEffect (starts around 683)
const classificationEffectRegex = /useEffect\(\(\) => \{\n    if \(isManualSubjectRef\.current\) return;\n\n    const extractionResults = Object\.values\(attachmentExtractionByKey \|\| \{\}\);[\s\S]*?return \(\) => \{\n      isCancelled = true;\n      clearTimeout\(timeoutId\);\n    \};\n  \}, \[topic, attachmentExtractionByKey, hasManualDurationOverride, subjectOptions\]\);/g;
content = content.replace(classificationEffectRegex, `// Old text classification effect removed`);

// 6. Update `boardPreparationSource` construction in `confirmRequest`
content = content.replace(
  `const boardPreparationSource = buildBoardPreparationSource({\n        attachments,\n        uploadedAttachments,\n        attachmentExtractionByKey,\n      });`,
  `const boardPreparationSource = buildBoardPreparationSource({\n        attachments,\n        uploadedAttachments,\n        attachmentExtractionByKey,\n        gptExtraction,\n      });`
);

fs.writeFileSync('web/src/pages/app/student/StudentDashboardPage.jsx', content, 'utf8');
console.log('Frontend patch applied.');
