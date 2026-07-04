# Local ML Classifier

This folder contains the lightweight CPU-only classifier used before JS rules and Gemini fallback.

## Runtime inference

The Cloud Function calls:

```bash
python3 functions/ml/local_classifier.py predict --model functions/ml/local_model.json
```

Input is JSON via stdin with:

- `text`
- `supportedSubjects`
- `features` (`questionCount`, `marksCount`, `tableCount`, `figureCount`, `formulaCount`)

## Training data growth

Classification events are written to Firestore collection:

- `classificationTrainingEvents`

Use those events to export labeled records and update `local_model.json`.

Suggested record schema for future training:

- `text`
- `subject`
- `topic`
- `minutes`

The current model is token-frequency based and intentionally small for CPU execution.
