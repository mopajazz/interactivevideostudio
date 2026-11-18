import type { Interaction } from '@ivt/schema';

/** What every per-type editor in the drawer gets: the checkpoint and a way to change it. */
export type EditorProps = { it: Interaction; onPatch: (update: (it: Interaction) => Interaction) => void };
