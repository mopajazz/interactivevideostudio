import type { Project } from '@ivt/schema';

/** Characters XML 1.0 does not allow at all (most C0 controls, U+FFFE/U+FFFF, lone surrogates). */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Text safe inside XML/HTML markup: illegal characters dropped, then the five specials escaped. */
export function escapeXml(s: string): string {
  return s
    .replace(XML_ILLEGAL, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** FNV-1a 32 of the UTF-8 bytes, as 8 hex digits. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * A per-package manifest identifier: `ivt-<title slug>-<hash of the project>`. LMSes that key a course by its
 * manifest identifier then never confuse two different packages. Always a valid XML ID (starts with a letter).
 */
export function manifestIdentifier(project: Project): string {
  const slug = project.title.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'course';
  return `ivt-${slug}-${fnv(JSON.stringify(project))}`;
}

/** A SCORM 1.2 imsmanifest.xml with one organization, one item and one SCO that launches index.html. */
export function buildManifest(title: string, files: string[], identifier = 'ivt-course'): string {
  const t = escapeXml(title);
  const fileTags = files.map((f) => `      <file href="${escapeXml(f)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(identifier)}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ivt-org">
    <organization identifier="ivt-org">
      <title>${t}</title>
      <item identifier="ivt-item" identifierref="ivt-sco">
        <title>${t}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="ivt-sco" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileTags}
    </resource>
  </resources>
</manifest>
`;
}
