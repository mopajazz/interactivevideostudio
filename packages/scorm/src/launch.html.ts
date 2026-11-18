import type { Project } from '@ivt/schema';
import { escapeXml } from './manifest';

/** JSON safe to inline in a <script> element: no `<` (so no `</script>` or `<!--`) and no JS line terminators. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildIndexHtml(project: Project): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(project.title)}</title>
<link rel="stylesheet" href="player.css">
</head>
<body>
<div id="ivt-root"></div>
<script type="application/json" id="ivt-project">${inlineJson(project)}</script>
<script src="player.js"></script>
<script src="launch.js"></script>
<script>
var project = JSON.parse(document.getElementById('ivt-project').textContent);
IVScorm.start(window, document, project, IVPlayer.mount);
</script>
</body>
</html>
`;
}
