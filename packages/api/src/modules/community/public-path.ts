// Own file: the search index needs it, and community.service imports the search module (no import cycle).
/** SQL condition (alias `p`) for a path anyone can see and copy: an active original. Hidden originals stay public. */
export const PUBLIC_PATH = "p.status = 'active' AND p.source_path_id IS NULL";
