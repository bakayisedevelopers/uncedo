const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const repoRoot = path.resolve(__dirname, '..');
const sharedRewards = require(path.join(repoRoot, 'shared', 'rewards'));

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertIncludes(relativePath, expectedSnippet) {
  const content = readFile(relativePath);
  assert.ok(
    content.includes(expectedSnippet),
    `${relativePath} must include ${expectedSnippet}`,
  );
}

assert.deepEqual(sharedRewards.MEMBERSHIP_LEVELS, ['neighbour', 'partner', 'friend', 'family']);
assert.deepEqual(sharedRewards.MASTERY_LEVELS, ['beginner', 'specialist', 'master', 'legend']);
assert.equal(sharedRewards.RATING_DIRECTIONS.CUSTOMER_TO_HELPER, 'customer_to_helper');
assert.equal(sharedRewards.REWARD_CONFIG_DOCS.GLOBAL, 'global');

assertIncludes('uncedo/src/shared/rewards.js', "import sharedRewards from '../../../shared/rewards/index.js';");
assertIncludes('helpers/src/shared/rewards.js', "import sharedRewards from '../../../shared/rewards/index.js';");
assertIncludes('admin/src/shared/rewards.js', "import sharedRewards from '../../../shared/rewards/index.js';");
assertIncludes('uncedo/src/services/rewards/rewardClientService.js', "import { REWARD_CONFIG_DOCS } from '../../shared/rewards';");
assertIncludes('helpers/src/services/rewards/rewardClientService.js', "import { REWARD_CONFIG_DOCS } from '../../shared/rewards';");
assertIncludes('uncedo/metro.config.js', 'config.watchFolders = [sharedRoot, functionsRoot];');
assertIncludes('helpers/metro.config.js', 'config.watchFolders = [sharedRoot];');
assertIncludes('admin/vite.config.js', "'@shared-rewards'");

console.log('Reward shared-source validation passed.');
