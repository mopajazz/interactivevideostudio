// The learner bundles every exported package ships, built by `pnpm --filter editor bundles` (the editor's dev,
// build, test and e2e scripts run it first; test/bundles.test.ts says so readably if they are missing).
import js from '../../../../packages/player/dist/player.js?raw';
import css from '../../../../packages/player/dist/player.css?raw';
import launchJs from '../../../../packages/scorm/dist/launch.js?raw';

export const learnerBundle = { js, css, launchJs };
