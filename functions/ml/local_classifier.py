import argparse
import json
import math
import re
from pathlib import Path


TOKEN_PATTERN = re.compile(r"[a-zA-Z][a-zA-Z0-9_+-]{1,}")


def tokenize(text):
    return [token.lower() for token in TOKEN_PATTERN.findall(str(text or ""))]


def load_model(path):
    model_path = Path(path)
    if not model_path.exists():
        return {
            "version": 1,
            "subjects": {},
            "topics": {},
            "minutes": {"bias": 12.0, "word_weight": 0.03, "question_weight": 3.8, "marks_weight": 0.25},
            "token_totals": {"subjects": {}, "topics": {}},
            "vocabulary": [],
        }
    with model_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def subject_candidates(model, supported_subjects):
    supported = []
    for entry in supported_subjects or []:
        value = (entry.get("value") if isinstance(entry, dict) else entry) or ""
        label = (entry.get("label") if isinstance(entry, dict) else "") or ""
        normalized = str(value).strip() or str(label).strip()
        if normalized:
            supported.append(normalized)
    if supported:
        return supported
    return list((model.get("subjects") or {}).keys())


def score_subject(model, tokens, subject):
    token_counts = (((model.get("subjects") or {}).get(subject) or {}).get("token_counts") or {})
    total = float(((model.get("token_totals") or {}).get("subjects") or {}).get(subject, 0))
    vocab_size = max(1, len(model.get("vocabulary") or []))
    if not token_counts:
        return 0.0
    log_prob = 0.0
    for token in tokens:
        count = float(token_counts.get(token, 0))
        log_prob += math.log((count + 1.0) / (total + vocab_size))
    return log_prob


def predict(payload, model):
    text = str(payload.get("text") or "")
    features = payload.get("features") or {}
    tokens = tokenize(text)
    candidates = subject_candidates(model, payload.get("supportedSubjects") or [])

    best_subject = ""
    subject_scores = []
    for subject in candidates:
        score = score_subject(model, tokens, subject)
        subject_scores.append((subject, score))
    subject_scores.sort(key=lambda item: item[1], reverse=True)
    if subject_scores:
        best_subject = subject_scores[0][0]

    if len(subject_scores) > 1:
        gap = subject_scores[0][1] - subject_scores[1][1]
        subject_confidence = max(0.0, min(1.0, 0.5 + (gap / 12.0)))
    else:
        if best_subject:
            token_counts = (((model.get("subjects") or {}).get(best_subject) or {}).get("token_counts") or {})
            overlap = len([token for token in tokens if token in token_counts])
            subject_confidence = max(0.55, min(0.88, 0.55 + (0.08 * overlap)))
        else:
            subject_confidence = 0.0

    topic_scores = []
    topics_for_subject = (model.get("topics") or {}).get(best_subject, {})
    for topic, config in topics_for_subject.items():
        token_counts = (config or {}).get("token_counts") or {}
        topic_total = float((config or {}).get("token_total", 0))
        vocab_size = max(1, len(model.get("vocabulary") or []))
        if not token_counts:
            continue
        log_prob = 0.0
        for token in tokens:
            count = float(token_counts.get(token, 0))
            log_prob += math.log((count + 1.0) / (topic_total + vocab_size))
        topic_scores.append((topic, log_prob))
    topic_scores.sort(key=lambda item: item[1], reverse=True)
    best_topic = topic_scores[0][0] if topic_scores else ""
    topic_confidence = 0.0
    if len(topic_scores) > 1:
        topic_gap = topic_scores[0][1] - topic_scores[1][1]
        topic_confidence = max(0.0, min(1.0, 0.5 + (topic_gap / 10.0)))
    elif best_topic:
        topic_confidence = 0.55

    word_count = len(tokens)
    question_count = float(features.get("questionCount") or 0)
    marks_count = float(features.get("marksCount") or 0)
    table_count = float(features.get("tableCount") or 0)
    figure_count = float(features.get("figureCount") or 0)
    formula_count = float(features.get("formulaCount") or 0)

    minutes_model = model.get("minutes") or {}
    estimate = (
        float(minutes_model.get("bias", 12.0))
        + (word_count * float(minutes_model.get("word_weight", 0.03)))
        + (question_count * float(minutes_model.get("question_weight", 3.8)))
        + (marks_count * float(minutes_model.get("marks_weight", 0.25)))
        + (table_count * 4.0)
        + (figure_count * 2.5)
        + (formula_count * 2.0)
    )
    estimated_minutes = int(max(10, min(90, round(estimate))))
    minutes_confidence = max(0.45, min(0.9, 0.45 + (0.06 * question_count) + (0.05 if word_count >= 40 else 0.0)))

    return {
        "subject": best_subject,
        "topic": best_topic,
        "estimatedMinutes": estimated_minutes,
        "subjectScore": round(subject_confidence, 4),
        "topicScore": round(topic_confidence, 4),
        "minutesScore": round(minutes_confidence, 4),
        "debug": {
            "wordCount": word_count,
            "subjectCandidates": len(candidates),
            "topSubjects": [{"subject": item[0], "score": round(item[1], 4)} for item in subject_scores[:3]],
            "topTopics": [{"topic": item[0], "score": round(item[1], 4)} for item in topic_scores[:3]],
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["predict"])
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    payload = json.loads(input() or "{}")
    model = load_model(args.model)
    print(json.dumps(predict(payload, model)))


if __name__ == "__main__":
    main()
