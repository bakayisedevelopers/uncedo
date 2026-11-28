function cleanId(value = '') {
  return String(value || '').trim();
}

export function getQuestionNodeKey(question = {}, index = 0) {
  return cleanId(question?.draftKey) || cleanId(question?.id) || `question_idx_${index}`;
}

export function getQuestionDependencyParentId(question = {}) {
  return cleanId(
    question?.dependencyRule?.dependsOnQuestionId
    || question?.dependsOn?.questionId
    || '',
  );
}

export function getPreferredDefaultTriggerValues(parentQuestion = null) {
  const options = Array.isArray(parentQuestion?.options) ? parentQuestion.options : [];
  const yesOption = options.find((opt) => {
    const val = cleanId(opt?.value).toLowerCase();
    const label = cleanId(opt?.label).toLowerCase();
    return val === 'yes' || label === 'yes';
  });
  if (yesOption) {
    const slug = cleanId(yesOption.value) || 'yes';
    return [slug];
  }
  return [];
}

export function buildQuestionTree(questions = []) {
  const list = Array.isArray(questions) ? questions : [];
  const nodes = list.map((question, arrayIndex) => ({
    key: getQuestionNodeKey(question, arrayIndex),
    id: cleanId(question?.id),
    question,
    arrayIndex,
    parentKey: null,
    parentQuestion: null,
    depth: 0,
    hierarchyNumber: '',
    directChildCount: 0,
    totalDescendantCount: 0,
    children: [],
  }));

  const nodeById = new Map();
  const nodeByKey = new Map();
  nodes.forEach((node) => {
    nodeByKey.set(node.key, node);
    if (node.id && !nodeById.has(node.id)) {
      nodeById.set(node.id, node);
    }
  });

  const createsCycle = (childNode, candidateParentNode) => {
    let cursor = candidateParentNode;
    const seen = new Set([childNode.key]);
    while (cursor) {
      if (seen.has(cursor.key)) return true;
      seen.add(cursor.key);
      cursor = cursor.parentKey ? nodeByKey.get(cursor.parentKey) || null : null;
    }
    return false;
  };

  const roots = [];
  nodes.forEach((node) => {
    const parentId = getQuestionDependencyParentId(node.question);
    const parentNode = parentId ? nodeById.get(parentId) || null : null;
    if (parentNode && parentNode.key !== node.key && !createsCycle(node, parentNode)) {
      node.parentKey = parentNode.key;
      node.parentQuestion = parentNode.question;
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const finalizeNode = (node, depth, prefixNumber) => {
    node.depth = depth;
    node.hierarchyNumber = prefixNumber;
    node.directChildCount = node.children.length;
    let descendantSum = node.children.length;
    node.children.forEach((child, childIndex) => {
      finalizeNode(child, depth + 1, `${prefixNumber}.${childIndex + 1}`);
      descendantSum += child.totalDescendantCount;
    });
    node.totalDescendantCount = descendantSum;
  };

  roots.forEach((rootNode, rootIndex) => {
    finalizeNode(rootNode, 0, `${rootIndex + 1}`);
  });

  return roots;
}

export function unlinkDirectDependentsOfQuestion(removedQuestionId, questions = []) {
  const targetId = cleanId(removedQuestionId);
  const list = Array.isArray(questions) ? questions : [];
  return list
    .filter((question) => cleanId(question?.id) !== targetId)
    .map((question) => {
      if (!targetId || getQuestionDependencyParentId(question) !== targetId) {
        return question;
      }
      return {
        ...question,
        type: question?.type === 'standard' ? 'standard' : 'option-specific',
        dependencyRule: {
          dependsOnQuestionId: '',
          dependsOnOptionValue: '',
          dependsOnOptionValues: [],
        },
      };
    });
}

function slugText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function extractDependencyTriggerValues(question = {}) {
  const depRule = question?.dependencyRule && typeof question.dependencyRule === 'object'
    ? question.dependencyRule
    : null;
  const legacyDependsOn = question?.dependsOn && typeof question.dependsOn === 'object'
    ? question.dependsOn
    : null;
  const rawList = [
    ...(Array.isArray(depRule?.dependsOnOptionValues) ? depRule.dependsOnOptionValues : []),
    ...(Array.isArray(legacyDependsOn?.optionValues) ? legacyDependsOn.optionValues : []),
    ...(depRule?.dependsOnOptionValue ? [depRule.dependsOnOptionValue] : []),
    ...(legacyDependsOn?.optionValue ? [legacyDependsOn.optionValue] : []),
  ];
  const seen = new Set();
  const values = [];
  rawList.forEach((entry) => {
    const clean = cleanId(entry);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    values.push(clean);
  });
  return values;
}

export function enforceExclusiveServiceOptionQuestions(options = [], allowedQuestionIds = null) {
  const list = Array.isArray(options) ? options : [];
  const claimedIds = new Set();
  return list.map((option) => {
    if (option?.requiresNoOptionSpecificQuestions) {
      return {
        ...option,
        selectedQuestionIds: [],
      };
    }
    const nextIds = [];
    const rawIds = Array.isArray(option?.selectedQuestionIds) ? option.selectedQuestionIds : [];
    rawIds.forEach((rawId) => {
      const id = cleanId(rawId);
      if (!id) return;
      if (allowedQuestionIds && !allowedQuestionIds.has(id)) return;
      if (claimedIds.has(id)) return;
      claimedIds.add(id);
      nextIds.push(id);
    });
    return {
      ...option,
      selectedQuestionIds: nextIds,
    };
  });
}

function isUsableContextImageUrl(url = '') {
  const clean = cleanId(url);
  return /^data:image\//i.test(clean) || /^https:\/\//i.test(clean);
}

export function buildQuestionImageGenerationContext({
  question = null,
  allQuestions = [],
  serviceOptions = [],
  resolveImageUrl = (url) => url,
  excludeImageUrls = [],
  maxContextImages = 3,
} = {}) {
  const list = Array.isArray(allQuestions) ? allQuestions : [];
  const optionsList = Array.isArray(serviceOptions) ? serviceOptions : [];
  const byId = new Map();
  list.forEach((item) => {
    const id = cleanId(item?.id);
    if (id && !byId.has(id)) {
      byId.set(id, item);
    }
  });

  const targetQuestion = (cleanId(question?.id) && byId.get(cleanId(question.id))) || question || {};
  const rawSteps = [];
  const visitedIds = new Set(cleanId(targetQuestion?.id) ? [cleanId(targetQuestion.id)] : []);
  let cursor = targetQuestion;
  let topQuestion = targetQuestion;

  while (cursor) {
    const parentId = getQuestionDependencyParentId(cursor);
    if (!parentId || visitedIds.has(parentId)) break;
    const parentQuestion = byId.get(parentId);
    if (!parentQuestion) break;
    visitedIds.add(parentId);

    const triggerValues = extractDependencyTriggerValues(cursor);
    const parentOptions = Array.isArray(parentQuestion.options) ? parentQuestion.options : [];
    const matchedLabels = [];
    const matchedPictures = [];

    if (triggerValues.length > 0 && parentOptions.length > 0) {
      const triggerLower = new Set(triggerValues.map((val) => val.toLowerCase()));
      const triggerSlugs = new Set(triggerValues.map((val) => slugText(val)).filter(Boolean));
      const matchedOptIndexes = new Set();

      parentOptions.forEach((opt, optIdx) => {
        const rawVal = cleanId(opt?.value);
        const rawLabel = cleanId(opt?.label);
        const optSlug = slugText(rawVal || rawLabel || `option_${optIdx + 1}`);
        const matches = (rawVal && triggerLower.has(rawVal.toLowerCase()))
          || (rawLabel && triggerLower.has(rawLabel.toLowerCase()))
          || (optSlug && triggerSlugs.has(optSlug));
        if (!matches) return;
        matchedOptIndexes.add(optIdx);
        const displayLabel = rawLabel || rawVal || `Option ${optIdx + 1}`;
        matchedLabels.push(displayLabel);
        const resolvedPic = cleanId(resolveImageUrl(opt?.imageUrl || opt?.imageUri || ''));
        if (isUsableContextImageUrl(resolvedPic)) {
          matchedPictures.push({
            label: `Parent choice "${displayLabel}" for "${cleanId(parentQuestion.prompt) || parentQuestion.id}"`,
            sourceType: 'parent_option',
            rawUrl: resolvedPic,
          });
        }
      });

      if (matchedOptIndexes.size === 0) {
        matchedLabels.push(...triggerValues);
      }
    } else if (triggerValues.length > 0) {
      matchedLabels.push(...triggerValues);
    }

    rawSteps.push({
      questionId: cleanId(parentQuestion.id),
      questionPrompt: cleanId(parentQuestion.prompt) || cleanId(parentQuestion.id),
      selectedAnswers: matchedLabels,
      optionPictures: matchedPictures,
    });

    topQuestion = parentQuestion;
    cursor = parentQuestion;
  }

  const topQuestionId = cleanId(topQuestion?.id);
  const isTopStandard = cleanId(topQuestion?.type).toLowerCase() === 'standard';
  const matchedServiceOption = !isTopStandard && topQuestionId
    ? optionsList.find((opt) => (
      !opt?.requiresNoOptionSpecificQuestions
      && Array.isArray(opt?.selectedQuestionIds)
      && opt.selectedQuestionIds.some((qid) => cleanId(qid) === topQuestionId)
    )) || null
    : null;

  const serviceOption = matchedServiceOption
    ? {
        id: cleanId(matchedServiceOption.id),
        title: cleanId(matchedServiceOption.title),
        description: cleanId(matchedServiceOption.description),
      }
    : null;

  const excludedSet = new Set(
    (Array.isArray(excludeImageUrls) ? excludeImageUrls : [])
      .map((url) => cleanId(url))
      .filter(Boolean),
  );
  const seenUrls = new Set();
  const contextImages = [];
  const cap = Math.max(0, Number(maxContextImages) || 3);

  const tryAddContextImage = ({ label, sourceType, rawUrl }) => {
    if (contextImages.length >= cap) return;
    const cleanUrl = cleanId(rawUrl);
    if (!isUsableContextImageUrl(cleanUrl)) return;
    if (excludedSet.has(cleanUrl) || seenUrls.has(cleanUrl)) return;
    seenUrls.add(cleanUrl);
    const isData = /^data:image\//i.test(cleanUrl);
    contextImages.push({
      label: cleanId(label),
      sourceType: cleanId(sourceType),
      imageDataUrl: isData ? cleanUrl : '',
      imageUrl: isData ? '' : cleanUrl,
    });
  };

  // Prioritize immediate parent option picture(s), then top linked Service Option picture,
  // then earlier ancestor option pictures along the dependency chain.
  if (rawSteps[0]?.optionPictures?.length) {
    rawSteps[0].optionPictures.forEach(tryAddContextImage);
  }
  if (matchedServiceOption) {
    const resolvedOptionPic = cleanId(resolveImageUrl(matchedServiceOption.imageUrl || ''));
    tryAddContextImage({
      label: `Service Option "${cleanId(matchedServiceOption.title) || cleanId(matchedServiceOption.id)}"`,
      sourceType: 'service_option',
      rawUrl: resolvedOptionPic,
    });
  }
  rawSteps.slice(1).forEach((step) => {
    (step.optionPictures || []).forEach(tryAddContextImage);
  });

  const contextChain = [...rawSteps].reverse().map((step) => ({
    questionId: step.questionId,
    questionPrompt: step.questionPrompt,
    selectedAnswers: step.selectedAnswers,
  }));

  return {
    serviceOption,
    contextChain,
    contextImages,
  };
}
