const baseThresholds = {
  subject: 0.2,
  topic: 0.15,
  questionBoundary: 0.35,
};

const baseMinuteRules = {
  baseMinutes: 15,
  perQuestionMinutes: 10,
  perSubQuestionMinutes: 2,
  readingPassageBonus: 8,
  maxMinutes: 90,
  minMinutes: 10,
};

function createPack({
  subjectId,
  displayName,
  aliases = [],
  keywords = [],
  topicKeywords = {},
  commandWords = [],
}) {
  return {
    subjectId,
    displayName,
    aliases,
    countriesSupported: ['ZA', 'ZW', 'ZM', 'BW', 'NA', 'LS', 'SZ'],
    languagesSupported: ['en', 'zu', 'af'],
    keywords,
    topicKeywords,
    commandWords,
    numberingPatterns: ['question 1', '1.', '1.1', 'a)', '(a)', 'i)', 'section a'],
    marksPatterns: ['[10]', '(10)', '10 marks', '/10'],
    layoutPatterns: ['section', 'question', 'activity', 'task', 'read the passage'],
    confidenceThresholds: baseThresholds,
    estimatedDifficultyWeights: {
      calculation: 1.1,
      explanation: 1.0,
      essay: 1.3,
      comprehension: 1.2,
      practical: 1.25,
    },
    estimatedMinuteRules: baseMinuteRules,
    parserHints: {
      preferMarksAsBoundaries: true,
      allowUnnumberedInstructionBlocks: true,
    },
    enabled: true,
    version: '1.0.0',
  };
}

const SUBJECT_PACKS = [
  createPack({
    subjectId: 'mathematics',
    displayName: 'Mathematics',
    aliases: ['math', 'maths', 'mathematics', 'paper 1', 'paper 2', 'algebra', 'calculus', 'trigonometry', 'geometry'],
    keywords: [
      'equation', 'inequality', 'factorise', 'simplify', 'graph', 'gradient', 'intercept', 'domain', 'range',
      'sequence', 'series', 'arithmetic', 'geometric', 'finance', 'growth', 'decay', 'compound interest',
      'derivative', 'turning point', 'stationary point', 'probability', 'counting principle', 'euclidean geometry',
      'analytical geometry', 'trigonometry', 'statistics', 'regression', 'distance formula', 'midpoint',
    ],
    topicKeywords: {
      algebraAndFunctions: ['function', 'inverse', 'composite', 'quadratic', 'cubic', 'exponential', 'logarithm', 'modulus'],
      sequencesAndSeries: ['sequence', 'series', 'nth term', 'sum to n', 'sigma notation'],
      financeGrowthDecay: ['interest rate', 'nominal', 'effective', 'annuity', 'present value', 'future value'],
      calculus: ['derivative', 'differentiate', 'maximum', 'minimum', 'optimization', 'rate of change'],
      probability: ['sample space', 'independent', 'dependent', 'mutually exclusive', 'tree diagram'],
      trigonometry: ['sine', 'cosine', 'tangent', 'identities', 'compound angle', 'double angle'],
      analyticalGeometry: ['gradient', 'distance', 'midpoint', 'equation of line', 'equation of circle'],
      euclideanGeometry: ['theorem', 'cyclic quadrilateral', 'tangent', 'chord', 'similar triangles', 'congruent triangles'],
      statisticsRegression: ['mean', 'standard deviation', 'percentile', 'box and whisker', 'scatter plot', 'regression line'],
    },
    commandWords: ['calculate', 'solve', 'prove', 'determine', 'show', 'differentiate', 'sketch', 'verify', 'justify'],
  }),
  createPack({
    subjectId: 'english',
    displayName: 'English',
    aliases: ['english hl', 'english fal', 'english home language', 'english first additional language', 'language'],
    keywords: [
      'comprehension', 'summary', 'transactional writing', 'essay', 'literature', 'poetry', 'drama', 'novel',
      'short story', 'language structures', 'punctuation', 'grammar', 'tense', 'register', 'tone', 'theme',
      'figurative language', 'metaphor', 'simile', 'personification', 'irony', 'critical language awareness',
    ],
    topicKeywords: {
      paper1LanguageInContext: ['comprehension', 'visual literacy', 'summary', 'language use', 'editing', 'register', 'audience'],
      paper2Literature: ['poetry', 'unseen poem', 'novel', 'drama', 'characterisation', 'setting', 'theme', 'plot'],
      paper3Writing: ['essay', 'discursive', 'argumentative', 'narrative', 'transactional', 'letter', 'speech', 'article'],
      grammarAndStyle: ['parts of speech', 'voice', 'syntax', 'cohesion', 'coherence', 'punctuation', 'spelling'],
    },
    commandWords: ['explain', 'discuss', 'summarise', 'describe', 'analyse', 'evaluate', 'interpret', 'comment'],
  }),
  createPack({
    subjectId: 'physical_sciences',
    displayName: 'Physical Sciences',
    aliases: ['physics', 'chemistry', 'physical science'],
    keywords: [
      'motion', 'force', 'newton', 'momentum', 'impulse', 'work', 'power', 'energy', 'doppler effect',
      'electric circuits', 'resistance', 'internal resistance', 'electrodynamics', 'photoelectric effect',
      'organic chemistry', 'stoichiometry', 'reaction rate', 'equilibrium', 'acids and bases', 'redox', 'electrochemistry',
    ],
    topicKeywords: {
      mechanics: ['vectors', 'velocity', 'acceleration', 'projectile', 'newton laws', 'friction', 'momentum'],
      wavesLightSound: ['wave', 'frequency', 'wavelength', 'doppler', 'interference', 'diffraction', 'refraction'],
      electricityMagnetism: ['electrostatics', 'electric field', 'coulomb', 'circuit', 'emf', 'generator', 'motor'],
      matterAndMaterials: ['atom', 'periodic table', 'bonding', 'intermolecular forces', 'gas laws'],
      chemicalChange: ['stoichiometry', 'reaction rates', 'equilibrium', 'acid base', 'redox', 'electrolysis'],
      organicChemistry: ['hydrocarbon', 'functional group', 'isomer', 'addition', 'substitution', 'elimination'],
    },
    commandWords: ['calculate', 'derive', 'state', 'explain', 'predict', 'balance', 'deduce', 'justify'],
  }),
  createPack({
    subjectId: 'mathematical_literacy',
    displayName: 'Maths Literacy',
    aliases: ['math lit', 'mat lit', 'math literacy', 'maths lit', 'mathematical literacy'],
    keywords: [
      'budget', 'income', 'expenditure', 'profit', 'loss', 'simple interest', 'compound interest',
      'loan', 'instalment', 'tax', 'vat', 'cost price', 'selling price', 'table', 'graph', 'probability',
      'maps', 'plans', 'scale', 'measurement', 'perimeter', 'area', 'volume', 'unit conversion',
    ],
    topicKeywords: {
      finance: ['budget', 'bank statement', 'salary advice', 'savings', 'inflation', 'exchange rate', 'hire purchase'],
      dataHandling: ['mean', 'median', 'mode', 'range', 'graph', 'table', 'infographic', 'trend'],
      mapsPlansAndRepresentation: ['map', 'plan', 'bearing', 'scale drawing', 'distance', 'route'],
      measurement: ['length', 'mass', 'capacity', 'area', 'surface area', 'volume', 'time conversion'],
      probability: ['chance', 'outcome', 'sample space', 'relative frequency'],
    },
    commandWords: ['calculate', 'estimate', 'determine', 'interpret', 'compare', 'convert', 'analyse'],
  }),
  createPack({
    subjectId: 'life_sciences',
    displayName: 'Life Sciences',
    aliases: ['biology', 'life science'],
    keywords: [
      'dna', 'rna', 'meiosis', 'mitosis', 'genetics', 'inheritance', 'evolution', 'natural selection',
      'human reproduction', 'vertebrate reproduction', 'endocrine system', 'homeostasis', 'nervous system',
      'ecology', 'population', 'biodiversity', 'photosynthesis', 'respiration', 'human impact',
    ],
    topicKeywords: {
      dnaAndMeiosis: ['dna replication', 'nucleotide', 'meiosis', 'crossing over', 'gamete'],
      geneticsAndInheritance: ['genotype', 'phenotype', 'dominant', 'recessive', 'punnett'],
      evolution: ['natural selection', 'speciation', 'human evolution', 'fossil evidence'],
      reproduction: ['human reproduction', 'menstrual cycle', 'fertilisation', 'embryo', 'placenta'],
      respondingToEnvironment: ['nervous system', 'endocrine', 'homeostasis', 'tropism'],
      ecologyAndHumanImpact: ['food web', 'carbon cycle', 'water cycle', 'pollution', 'conservation'],
    },
    commandWords: ['label', 'describe', 'identify', 'explain', 'differentiate', 'interpret', 'evaluate'],
  }),
  createPack({
    subjectId: 'agricultural_sciences',
    displayName: 'Agriculture',
    aliases: ['agric', 'agriculture', 'agricultural science'],
    keywords: [
      'animal nutrition', 'feed flow', 'digestibility', 'pearson square', 'nutritive ratio',
      'animal production', 'animal diseases', 'animal reproduction', 'breeding systems',
      'soil science', 'soil texture', 'soil structure', 'water management', 'irrigation',
      'agricultural management', 'marketing', 'production factors', 'agricultural genetics',
    ],
    topicKeywords: {
      animalNutrition: ['ration', 'nutrient', 'digestibility coefficient', 'pearson square', 'feed conversion'],
      animalProductionProtectionControl: ['livestock', 'housing', 'parasite', 'vaccination', 'biosecurity'],
      animalReproduction: ['estrus', 'fertility', 'insemination', 'gestation', 'selection'],
      managementAndMarketing: ['enterprise budget', 'gross margin', 'value chain', 'marketing channel', 'record keeping'],
      productionFactors: ['land', 'labour', 'capital', 'management', 'risk management'],
      agriculturalGenetics: ['heredity', 'crossbreeding', 'hybrid vigor', 'selection', 'genotype'],
    },
    commandWords: ['explain', 'identify', 'calculate', 'describe', 'classify', 'differentiate', 'apply'],
  }),
  createPack({
    subjectId: 'accounting',
    displayName: 'Accounting',
    aliases: ['accounts', 'bookkeeping'],
    keywords: [
      'financial statements', 'income statement', 'statement of financial position', 'cash flow statement',
      'companies', 'shares', 'dividends', 'fixed assets', 'inventory', 'debtors', 'creditors',
      'cash budget', 'projected income statement', 'cost accounting', 'break-even', 'ethics', 'internal control',
      'gaap', 'ifrs', 'ratio analysis', 'audit report',
    ],
    topicKeywords: {
      financialReportingAndEvaluation: ['companies', 'shares', 'published financial statements', 'audit report', 'ratio indicators'],
      companiesLedgerAndAdjustments: ['ledger', 'journal', 'pre-adjustment', 'post-adjustment', 'depreciation', 'accrual'],
      costAndManagerialAccounting: ['manufacturing', 'production cost statement', 'break-even', 'variable cost', 'fixed cost'],
      budgetingAndCashFlow: ['cash budget', 'projected', 'variance', 'actual', 'forecast'],
      ethicsAndControl: ['internal control', 'corporate governance', 'ethics', 'fraud prevention'],
    },
    commandWords: ['calculate', 'prepare', 'record', 'explain', 'analyse', 'interpret', 'advise', 'reconcile'],
  }),
  createPack({
    subjectId: 'business_studies',
    displayName: 'Business Studies',
    aliases: ['business'],
    keywords: [
      'business environments', 'macro environment', 'business strategy', 'business sectors',
      'human resources', 'quality of performance', 'team performance', 'conflict management',
      'entrepreneurship', 'business plan', 'marketing', 'production', 'operations',
      'investment', 'insurance', 'creative thinking', 'problem solving', 'leadership', 'ethics', 'corporate social responsibility',
    ],
    topicKeywords: {
      businessEnvironments: ['legislation', 'pestle', 'three sectors', 'strategies', 'porters'],
      businessOperations: ['human resources', 'quality management', 'production function', 'purchasing function'],
      businessVentures: ['forms of ownership', 'investment securities', 'business opportunity', 'presentation'],
      businessRoles: ['ethics', 'professionalism', 'social responsibility', 'stress management', 'diversity'],
      marketingAndEntrepreneurship: ['market segmentation', 'promotion', 'pricing', 'distribution', 'entrepreneur'],
    },
    commandWords: ['discuss', 'analyse', 'recommend', 'justify', 'evaluate', 'motivate', 'propose', 'compare'],
  }),
  createPack({
    subjectId: 'economics',
    displayName: 'Economics',
    aliases: ['econ', 'economic studies'],
    keywords: [
      'circular flow', 'business cycles', 'public sector', 'fiscal policy', 'monetary policy',
      'foreign exchange', 'balance of payments', 'protectionism', 'free trade',
      'economic growth', 'economic development', 'industrial policy', 'economic indicators',
      'perfect markets', 'imperfect markets', 'market failure', 'inflation', 'tourism', 'environmental sustainability',
    ],
    topicKeywords: {
      macroeconomics: ['circular flow', 'national accounts', 'multiplier', 'business cycles', 'public sector'],
      economicPursuits: ['protectionism', 'free trade', 'growth', 'development', 'industrial development', 'regional development'],
      microeconomics: ['demand', 'supply', 'elasticity', 'perfect competition', 'monopoly', 'oligopoly'],
      contemporaryIssues: ['inflation', 'tourism', 'environmental sustainability', 'climate change economics'],
      policyAndIndicators: ['gdp', 'cpi', 'ppi', 'unemployment', 'fiscal deficit', 'repo rate'],
    },
    commandWords: ['explain', 'calculate', 'analyse', 'discuss', 'evaluate', 'interpret', 'differentiate', 'justify'],
  }),
];

function loadEnabledSubjectPacks() {
  return SUBJECT_PACKS.filter((pack) => pack.enabled);
}

module.exports = {
  SUBJECT_PACKS,
  loadEnabledSubjectPacks,
};
