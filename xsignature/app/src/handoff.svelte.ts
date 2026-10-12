/**
 * A signature made on one screen, handed to a document waiting on the other.
 *
 * In memory and nowhere else: nothing here is written to storage, and a reload
 * empties it along with everything else, which is the no-retention rule doing
 * its job. It holds two things only — the name of the document that is waiting,
 * so the signature screen can offer to send something to it, and the signature
 * on its way there, until the document screen takes it.
 */

export interface Delivery {
  /** The SVG exactly as "Save SVG" would write it. */
  readonly svg: string;
  /** What step 2 calls it. */
  readonly name: string;
}

export const handoff = $state<{
  /** The document open on the document screen, or null when there is none. */
  waiting: string | null;
  /** A signature sent from the signature screen and not yet taken. */
  delivery: Delivery | null;
}>({ waiting: null, delivery: null });

/** Take the delivery, leaving nothing behind. */
export function collect(): Delivery | null {
  const delivery = handoff.delivery;
  handoff.delivery = null;
  return delivery;
}
